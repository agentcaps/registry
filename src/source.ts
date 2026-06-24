import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTextFile, removeDir, runGit, sha256, parseGitHubRepoUrl, fileUrl } from './utils.js';
import type { SourceDefinition, SourceSnapshot } from './types.js';

export interface FetchedArtifact {
  snapshot: SourceSnapshot;
  content: string;
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

export async function fetchGitSource(source: SourceDefinition): Promise<FetchedArtifact> {
  const artifactPath = source.path ?? 'SKILL.md';
  const trackingRef = source.trackingRef ?? 'HEAD';
  const tempDir = await mkdtemp(join(tmpdir(), 'agentcaps-git-'));
  try {
    const cloneArgs = ['clone', '--depth', '1'];
    if (trackingRef !== 'HEAD') cloneArgs.push('--branch', trackingRef);
    cloneArgs.push(source.url, tempDir);
    await runGit(cloneArgs);
    const sourceCommit = await runGit(['rev-parse', 'HEAD'], tempDir);
    const content = await readTextFile(join(tempDir, artifactPath));
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

export async function latestGitCommit(source: SourceDefinition): Promise<string> {
  const trackingRef = source.trackingRef ?? 'HEAD';
  const output = await runGit(['ls-remote', source.url, trackingRef]);
  const first = output.split('\n')[0]?.trim();
  if (!first) throw new Error(`No remote ref found for ${source.url} ${trackingRef}`);
  return first.split(/\s+/)[0];
}
