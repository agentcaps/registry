import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTextFile, removeDir, runGit, sha256, parseGitHubRepoUrl, fileUrl, slugify } from './utils.js';
import type { SourceDefinition, SourceSnapshot } from './types.js';

export interface FetchedArtifact {
  snapshot: SourceSnapshot;
  content: string;
}

export interface FetchedSourceEntry extends FetchedArtifact {
  slug: string;
  source: SourceDefinition;
}

function artifactUrls(sourceUrl: string, commit: string, path: string): { web?: string; raw?: string; repo?: string } {
  const github = parseGitHubRepoUrl(sourceUrl);
  if (github) {
    return {
      repo: `https://github.com/${github.owner}/${github.repo}`,
      web: `https://github.com/${github.owner}/${github.repo}/blob/${commit}/${path}`,
      raw: `https://raw.githubusercontent.com/${github.owner}/${github.repo}/${commit}/${path}`
    };
  }
  const gitlab = sourceUrl.replace(/\.git$/, '').match(/^(https?:\/\/gitlab\.[^/]+\/.+)$/);
  if (gitlab) {
    const repo = gitlab[1];
    return { repo, web: `${repo}/-/blob/${commit}/${path}`, raw: `${repo}/-/raw/${commit}/${path}` };
  }
  return {};
}

async function cloneGitSource(source: SourceDefinition, tempDir: string): Promise<{ sourceCommit: string; trackingRef: string }> {
  const trackingRef = source.trackingRef ?? 'HEAD';
  const cloneArgs = ['clone', '--depth', '1'];
  if (trackingRef !== 'HEAD') cloneArgs.push('--branch', trackingRef);
  cloneArgs.push(source.url, tempDir);
  await runGit(cloneArgs);
  const sourceCommit = await runGit(['rev-parse', 'HEAD'], tempDir);
  return { sourceCommit, trackingRef };
}

async function fetchGitArtifactFromCheckout(
  source: SourceDefinition,
  checkoutDir: string,
  sourceCommit: string,
  trackingRef: string,
  artifactPath: string
): Promise<FetchedArtifact> {
  const content = await readTextFile(join(checkoutDir, artifactPath));
  const digest = sha256(content);
  const urls = artifactUrls(source.url, sourceCommit, artifactPath);
  const localArtifact = resolve(source.url, artifactPath);
  const fetchedAt = new Date().toISOString();
  return {
    content,
    snapshot: {
      sourceType: 'git_repository',
      sourceUrl: source.url,
      sourceRepositoryUrl: urls.repo ?? source.url,
      sourceWebUrl: urls.web ?? fileUrl(localArtifact),
      sourceCommit,
      trackingRef,
      artifactPath,
      pinnedArtifactUrl: urls.web ?? fileUrl(localArtifact),
      rawArtifactUrl: urls.raw ?? fileUrl(localArtifact),
      sourceDigest: digest,
      fetchedAt
    }
  };
}

export async function fetchGitSource(source: SourceDefinition): Promise<FetchedArtifact> {
  const artifactPath = source.path ?? 'SKILL.md';
  const tempDir = await mkdtemp(join(tmpdir(), 'agentcaps-git-'));
  try {
    const { sourceCommit, trackingRef } = await cloneGitSource(source, tempDir);
    return fetchGitArtifactFromCheckout(source, tempDir, sourceCommit, trackingRef, artifactPath);
  } finally {
    await removeDir(tempDir);
  }
}

async function listRelativeFiles(root: string, base = ''): Promise<string[]> {
  const dir = join(root, base);
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = base ? posix.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listRelativeFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\/+/, '');
  let output = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '*') {
      if (normalized[index + 1] === '*') {
        output += '.*';
        index += 1;
      } else {
        output += '[^/]*';
      }
    } else if (char === '?') {
      output += '[^/]';
    } else if ('+.^${}()|[]\\'.includes(char)) {
      output += `\\${char}`;
    } else {
      output += char;
    }
  }
  return new RegExp(`${output}$`);
}

function collectionBaseSlug(sourceSlug: string, artifactPath: string): string {
  const dir = posix.dirname(artifactPath);
  const name = dir === '.' ? posix.basename(artifactPath, posix.extname(artifactPath)) : posix.basename(dir);
  return slugify(`${sourceSlug}-${name}`);
}

function collectionEntrySlug(sourceSlug: string, artifactPath: string, used: Set<string>): string {
  let slug = collectionBaseSlug(sourceSlug, artifactPath);
  if (used.has(slug)) {
    const withoutSkillFile = artifactPath.replace(/\/skill\.md$/i, '').replace(/\.md$/i, '');
    slug = slugify(`${sourceSlug}-${withoutSkillFile}`);
  }
  let candidate = slug;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export async function fetchGitCollectionSource(source: SourceDefinition): Promise<FetchedSourceEntry[]> {
  if (!source.include?.length) {
    throw new Error(`Collection source ${source.slug} requires at least one include glob.`);
  }
  const tempDir = await mkdtemp(join(tmpdir(), 'agentcaps-git-collection-'));
  try {
    const { sourceCommit, trackingRef } = await cloneGitSource(source, tempDir);
    const patterns = source.include.map(globToRegExp);
    const files = await listRelativeFiles(tempDir);
    const matches = [...new Set(files.filter((file) => patterns.some((pattern) => pattern.test(file))))].sort();
    if (!matches.length) {
      throw new Error(`Collection source ${source.slug} did not match any files.`);
    }

    const usedSlugs = new Set<string>();
    const entries: FetchedSourceEntry[] = [];
    for (const artifactPath of matches) {
      const childSource: SourceDefinition = {
        slug: collectionEntrySlug(source.slug, artifactPath, usedSlugs),
        type: 'git_repository',
        url: source.url,
        path: artifactPath,
        trackingRef: source.trackingRef,
        curation: source.curation
      };
      entries.push({
        slug: childSource.slug,
        source: childSource,
        ...(await fetchGitArtifactFromCheckout(childSource, tempDir, sourceCommit, trackingRef, artifactPath))
      });
    }
    return entries;
  } finally {
    await removeDir(tempDir);
  }
}

export async function fetchDirectUrlSource(source: SourceDefinition): Promise<FetchedArtifact> {
  const artifactPath = source.path ?? 'SKILL.md';
  let content: string;
  if (source.url.startsWith('file://')) {
    content = await readTextFile(fileURLToPath(source.url));
  } else if (!source.url.match(/^https?:\/\//)) {
    content = await readTextFile(source.url);
  } else {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`Failed to fetch ${source.url}: ${response.status}`);
    content = await response.text();
  }
  const fetchedAt = new Date().toISOString();
  return {
    content,
    snapshot: {
      sourceType: 'direct_url',
      sourceUrl: source.url,
      artifactPath,
      pinnedArtifactUrl: source.url,
      rawArtifactUrl: source.url,
      sourceDigest: sha256(content),
      fetchedAt
    }
  };
}

export async function fetchSource(source: SourceDefinition): Promise<FetchedArtifact> {
  if (source.type === 'git_repository') return fetchGitSource(source);
  if (source.type === 'direct_url') return fetchDirectUrlSource(source);
  throw new Error(`Unsupported source type: ${(source as { type: string }).type}`);
}

export async function fetchSourceEntries(source: SourceDefinition): Promise<FetchedSourceEntry[]> {
  if (source.type === 'git_repository_collection') return fetchGitCollectionSource(source);
  return [{ slug: source.slug, source, ...(await fetchSource(source)) }];
}

export async function latestGitCommit(source: SourceDefinition): Promise<string> {
  const trackingRef = source.trackingRef ?? 'HEAD';
  const output = await runGit(['ls-remote', source.url, trackingRef]);
  const first = output.split('\n')[0]?.trim();
  if (!first) throw new Error(`No remote ref found for ${source.url} ${trackingRef}`);
  return first.split(/\s+/)[0];
}
