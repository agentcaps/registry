import { join } from 'node:path';
import type { AICatalogManifest, DriftReport, PublicationRecord, RegistryEntryFile, DriftStatus } from './types.js';
import { buildCatalogEntry } from './catalog.js';
import { fetchSource, latestGitCommit } from './source.js';
import { parseSkillMarkdown } from './skill.js';
import { validateCatalogEntry } from './validation.js';
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

export async function importSource(slug: string, root: string): Promise<RegistryEntryFile> {
  await ensureRegistryDirs(root);
  const source = await findSource(slug, root);
  if (!source) throw new Error(`Source not found: ${slug}`);
  const config = await loadRegistryConfig(root);
  const fetched = await fetchSource(source);
  const skill = parseSkillMarkdown(fetched.content);
  const catalogEntry = buildCatalogEntry({ source, snapshot: fetched.snapshot, skill, config });
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
    snapshot: fetched.snapshot,
    publication: existing?.publication
  };
  await writeEntryBundle(root, entry, catalogEntry, validation);
  return entry;
}

export async function importAll(root: string): Promise<RegistryEntryFile[]> {
  const sources = await loadSources(root);
  const results: RegistryEntryFile[] = [];
  for (const source of sources.sources) results.push(await importSource(source.slug, root));
  return results;
}

export async function validateEntry(slug: string, root: string) {
  const catalogEntry = await readEntryCatalog(root, slug);
  const validation = validateCatalogEntry(catalogEntry);
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

export async function buildRegistry(root: string): Promise<AICatalogManifest> {
  await ensureRegistryDirs(root);
  const config = await loadRegistryConfig(root);
  const slugs = await listEntrySlugs(root);
  const entries = [];
  const docs = [];
  for (const slug of slugs) {
    const listing = await readListing(root, slug);
    if (listing.publicationStatus !== 'published') continue;
    if (config.excludeDriftedFromCatalog && listing.driftStatus === 'drifted') continue;
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
  if (entry.source.type !== 'git_repository') {
    const updated = { ...entry, driftStatus: 'unsupported' as const };
    const [catalogEntry, validation] = await Promise.all([readEntryCatalog(root, slug), readEntryValidation(root, slug)]);
    await writeEntryBundle(root, updated, catalogEntry, validation);
    const report: DriftReport = { slug, status: 'unsupported', checkedAt, message: 'Drift detection is unsupported for direct_url sources in V0.' };
    await writeDriftReport(root, slug, report);
    return report;
  }
  const latestCommit = await latestGitCommit(entry.source);
  const previousCommit = entry.snapshot.sourceCommit;
  const drifted = Boolean(previousCommit && latestCommit !== previousCommit);
  const status: DriftStatus = drifted ? 'drifted' : 'clean';
  const updated = { ...entry, driftStatus: status };
  const [catalogEntry, validation] = await Promise.all([readEntryCatalog(root, slug), readEntryValidation(root, slug)]);
  await writeEntryBundle(root, updated, catalogEntry, validation);
  const report: DriftReport = {
    slug,
    status,
    checkedAt,
    previousCommit,
    latestCommit,
    message: drifted ? 'Source ref changed; re-import and publish explicitly to update.' : 'Published snapshot matches tracked source ref.'
  };
  await writeDriftReport(root, slug, report);
  return report;
}

export async function checkAllDrift(root: string): Promise<DriftReport[]> {
  const slugs = await listEntrySlugs(root);
  const reports: DriftReport[] = [];
  for (const slug of slugs) reports.push(await checkDrift(slug, root));
  return reports;
}
