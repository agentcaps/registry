import { join } from 'node:path';
import type { AICatalogManifest, DriftReport, PublicationRecord, RegistryConfig, RegistryEntryFile, DriftStatus, SourceDefinition, SourceSnapshot } from './types.js';
import { buildCatalogEntry } from './catalog.js';
import { fetchSourceEntries, latestDirectUrlState, latestGitCommit } from './source.js';
import { parseSkillMarkdown } from './skill.js';
import { validateCatalogEntry, validateCatalogEntryWithReachability } from './validation.js';
import {
  ensureRegistryDirs,
  findSource,
  listEntrySlugs,
  loadRegistryConfig,
  loadSources,
  readEntry,
  readEntryCatalog,
  readEntryValidation,
  readListing,
  writeDriftReport,
  writeEntryBundle,
  writeJsonFile,
  writeYamlFile
} from './storage.js';
import { buildSearchIndex, documentFromEntry, searchIndex } from './search.js';
import type { SearchResult } from './types.js';

export async function initRegistry(root: string): Promise<void> {
  await ensureRegistryDirs(root);
  await writeYamlFile(join(root, 'registry.yaml'), {
    name: 'AgentCaps Registry',
    identifier: 'urn:air:agentcaps.local:registry:default',
    skillMediaType: 'application/ai-skill',
    excludeDriftedFromCatalog: false
  });
  await writeYamlFile(join(root, 'sources.yaml'), { sources: [] });
}

async function writeImportedEntry(input: {
  root: string;
  config: RegistryConfig;
  slug: string;
  source: SourceDefinition;
  snapshot: SourceSnapshot;
  content: string;
}): Promise<RegistryEntryFile> {
  const { root, config, slug, source, snapshot, content } = input;
  const skill = parseSkillMarkdown(content);
  const catalogEntry = buildCatalogEntry({ source, snapshot, skill, config });
  const validation = validateCatalogEntry(catalogEntry);
  let existing: RegistryEntryFile | undefined;
  try {
    existing = await readEntry(root, slug);
  } catch {
    existing = undefined;
  }
  const entry: RegistryEntryFile = {
    slug,
    entryId: existing?.entryId ?? slug,
    publicationStatus: existing?.publicationStatus ?? 'imported',
    driftStatus: existing?.driftStatus ?? 'unknown',
    source,
    snapshot,
    publication: existing?.publication
  };
  await writeEntryBundle(root, entry, catalogEntry, validation);
  return entry;
}

export async function importSourceEntries(slug: string, root: string): Promise<RegistryEntryFile[]> {
  await ensureRegistryDirs(root);
  const source = await findSource(slug, root);
  if (!source) throw new Error(`Source not found: ${slug}`);
  const config = await loadRegistryConfig(root);
  const fetchedEntries = await fetchSourceEntries(source);
  const results: RegistryEntryFile[] = [];
  for (const fetched of fetchedEntries) {
    results.push(await writeImportedEntry({
      root,
      config,
      slug: fetched.slug,
      source: fetched.source,
      snapshot: fetched.snapshot,
      content: fetched.content
    }));
  }
  return results;
}

export async function importSource(slug: string, root: string): Promise<RegistryEntryFile> {
  const results = await importSourceEntries(slug, root);
  if (results.length !== 1) {
    throw new Error(`Source ${slug} imported ${results.length} entries. Use importSourceEntries() for collection sources.`);
  }
  return results[0];
}

export async function importAll(root: string): Promise<RegistryEntryFile[]> {
  const sources = await loadSources(root);
  const results: RegistryEntryFile[] = [];
  for (const source of sources.sources) results.push(...(await importSourceEntries(source.slug, root)));
  return results;
}

export interface ValidateEntryOptions {
  checkUrls?: boolean;
  timeoutMs?: number;
}

export async function validateEntry(slug: string, root: string, options: ValidateEntryOptions = {}) {
  const catalogEntry = await readEntryCatalog(root, slug);
  const validation = options.checkUrls
    ? await validateCatalogEntryWithReachability(catalogEntry, { timeoutMs: options.timeoutMs })
    : validateCatalogEntry(catalogEntry);
  await writeJsonFile(join(root, 'entries', slug, 'validation.json'), validation);
  return validation;
}

export async function publishEntry(slug: string, root: string, publication: PublicationRecord = {}): Promise<RegistryEntryFile> {
  const entry = await readEntry(root, slug);
  const updated: RegistryEntryFile = {
    ...entry,
    publicationStatus: 'published',
    driftStatus: entry.driftStatus === 'drifted' ? 'drifted' : 'clean',
    publication: {
      ...entry.publication,
      ...publication,
      publishedAt: publication.publishedAt ?? new Date().toISOString()
    }
  };
  const [catalogEntry, validation] = await Promise.all([readEntryCatalog(root, slug), readEntryValidation(root, slug)]);
  await writeEntryBundle(root, updated, catalogEntry, validation);
  return updated;
}

export async function revokeEntry(slug: string, root: string): Promise<RegistryEntryFile> {
  const entry = await readEntry(root, slug);
  const updated: RegistryEntryFile = { ...entry, publicationStatus: 'revoked' };
  const [catalogEntry, validation] = await Promise.all([readEntryCatalog(root, slug), readEntryValidation(root, slug)]);
  await writeEntryBundle(root, updated, catalogEntry, validation);
  return updated;
}

export interface BuildOptions {
  excludeDrifted?: boolean;
}

export async function buildRegistry(root: string, options: BuildOptions = {}): Promise<AICatalogManifest> {
  await ensureRegistryDirs(root);
  const config = await loadRegistryConfig(root);
  const excludeDrifted = options.excludeDrifted ?? config.excludeDriftedFromCatalog ?? false;
  const slugs = await listEntrySlugs(root);
  const entries = [];
  const docs = [];
  for (const slug of slugs) {
    const listing = await readListing(root, slug);
    if (listing.publicationStatus !== 'published') continue;
    if (excludeDrifted && listing.driftStatus === 'drifted') continue;
    entries.push(listing.catalogEntry);
    docs.push(documentFromEntry(slug, listing.catalogEntry, { url: listing.source.url, path: listing.source.path }));
    await writeJsonFile(join(root, 'dist', 'listings', `${slug}.json`), listing);
  }
  const manifest: AICatalogManifest = {
    specVersion: '1.0',
    host: {
      displayName: config.name,
      identifier: config.identifier,
      documentationUrl: config.documentationUrl
    },
    entries
  };
  await writeJsonFile(join(root, 'dist', 'ai-catalog.json'), manifest);
  await writeJsonFile(join(root, 'dist', 'search-index.json'), buildSearchIndex(docs));
  return manifest;
}

export async function searchBuiltIndex(root: string, query: string, limit?: number): Promise<SearchResult[]> {
  const { readJsonFile } = await import('./storage.js');
  const index = await readJsonFile<import('./types.js').SearchIndexData>(join(root, 'dist', 'search-index.json'));
  return searchIndex(index, query, limit);
}

export async function checkDrift(slug: string, root: string): Promise<DriftReport> {
  const entry = await readEntry(root, slug);
  const checkedAt = new Date().toISOString();

  async function persist(status: DriftStatus): Promise<void> {
    const updated = { ...entry, driftStatus: status };
    const [catalogEntry, validation] = await Promise.all([readEntryCatalog(root, slug), readEntryValidation(root, slug)]);
    await writeEntryBundle(root, updated, catalogEntry, validation);
  }

  async function finalize(report: DriftReport): Promise<DriftReport> {
    await persist(report.status);
    await writeDriftReport(root, slug, report);
    return report;
  }

  if (entry.source.type === 'git_repository') {
    const latestCommit = await latestGitCommit(entry.source);
    const previousCommit = entry.snapshot.sourceCommit;
    const drifted = Boolean(previousCommit && latestCommit !== previousCommit);
    const status: DriftStatus = drifted ? 'drifted' : 'clean';
    return finalize({
      slug,
      status,
      checkedAt,
      sourceType: 'git_repository',
      previousCommit,
      latestCommit,
      message: drifted ? 'Source ref changed; re-import and publish explicitly to update.' : 'Published snapshot matches tracked source ref.'
    });
  }

  if (entry.source.type === 'direct_url') {
    const previousDigest = entry.snapshot.sourceDigest;
    const state = await latestDirectUrlState(entry.source, {
      etag: entry.snapshot.etag,
      lastModified: entry.snapshot.lastModified
    });
    let status: DriftStatus;
    let message: string;
    if (!state.available) {
      status = 'unknown';
      message = 'Direct URL source is currently unreachable; drift could not be determined.';
    } else if (state.notModified) {
      status = 'clean';
      message = 'Source not modified (validated via ETag / Last-Modified).';
    } else if (state.digest) {
      const drifted = state.digest !== previousDigest;
      status = drifted ? 'drifted' : 'clean';
      message = drifted
        ? 'Source content changed; re-import and publish explicitly to update.'
        : 'Source content digest matches the published snapshot.';
    } else {
      status = 'unknown';
      message = 'Could not read direct URL source content for drift comparison.';
    }
    const report: DriftReport = { slug, status, checkedAt, sourceType: 'direct_url', previousDigest, message };
    if (state.digest) report.latestDigest = state.digest;
    if (state.etag) report.etag = state.etag;
    if (state.lastModified) report.lastModified = state.lastModified;
    return finalize(report);
  }

  return finalize({
    slug,
    status: 'unsupported',
    checkedAt,
    sourceType: entry.source.type,
    message: `Drift detection is unsupported for ${entry.source.type} sources.`
  });
}

export async function checkAllDrift(root: string): Promise<DriftReport[]> {
  const slugs = await listEntrySlugs(root);
  const reports: DriftReport[] = [];
  for (const slug of slugs) reports.push(await checkDrift(slug, root));
  return reports;
}
