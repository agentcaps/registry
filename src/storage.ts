import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { DEFAULT_REGISTRY_DIR } from './constants.js';
import type { CatalogEntry, RegistryConfig, RegistryEntryFile, SourcesFile, ValidationReport, DriftReport, ListingDocument } from './types.js';

export function registryRoot(root = DEFAULT_REGISTRY_DIR): string {
  return root;
}

export async function ensureRegistryDirs(root = DEFAULT_REGISTRY_DIR): Promise<void> {
  await mkdir(join(root, 'entries'), { recursive: true });
  await mkdir(join(root, 'dist', 'listings'), { recursive: true });
}

export async function readYamlFile<T>(path: string): Promise<T> {
  return YAML.parse(await readFile(path, 'utf8')) as T;
}

export async function writeYamlFile(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, YAML.stringify(value), 'utf8');
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function loadRegistryConfig(root = DEFAULT_REGISTRY_DIR): Promise<RegistryConfig> {
  const path = join(root, 'registry.yaml');
  if (!existsSync(path)) {
    return { name: 'AgentCaps Registry', identifier: 'urn:air:agentcaps.local:registry:default' };
  }
  return readYamlFile<RegistryConfig>(path);
}

export async function loadSources(root = DEFAULT_REGISTRY_DIR): Promise<SourcesFile> {
  const path = join(root, 'sources.yaml');
  if (!existsSync(path)) return { sources: [] };
  return readYamlFile<SourcesFile>(path);
}

export async function findSource(slug: string, root = DEFAULT_REGISTRY_DIR) {
  const sources = await loadSources(root);
  return sources.sources.find((source) => source.slug === slug);
}

export function entryDir(root: string, slug: string): string {
  return join(root, 'entries', slug);
}

export async function writeEntryBundle(root: string, entry: RegistryEntryFile, catalogEntry: CatalogEntry, validation: ValidationReport): Promise<void> {
  const dir = entryDir(root, entry.slug);
  await mkdir(dir, { recursive: true });
  await writeYamlFile(join(dir, 'entry.yaml'), entry);
  await writeJsonFile(join(dir, 'catalog-entry.json'), catalogEntry);
  await writeJsonFile(join(dir, 'validation.json'), validation);
}

export async function readEntry(root: string, slug: string): Promise<RegistryEntryFile> {
  return readYamlFile<RegistryEntryFile>(join(entryDir(root, slug), 'entry.yaml'));
}

export async function readEntryCatalog(root: string, slug: string): Promise<CatalogEntry> {
  return readJsonFile<CatalogEntry>(join(entryDir(root, slug), 'catalog-entry.json'));
}

export async function readEntryValidation(root: string, slug: string): Promise<ValidationReport> {
  return readJsonFile<ValidationReport>(join(entryDir(root, slug), 'validation.json'));
}

export async function writeDriftReport(root: string, slug: string, drift: DriftReport): Promise<void> {
  await writeJsonFile(join(entryDir(root, slug), 'drift.json'), drift);
}

export async function listEntrySlugs(root = DEFAULT_REGISTRY_DIR): Promise<string[]> {
  const dir = join(root, 'entries');
  if (!existsSync(dir)) return [];
  const names = await readdir(dir, { withFileTypes: true });
  return names.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export async function readListing(root: string, slug: string): Promise<ListingDocument> {
  const [entry, catalogEntry, validation] = await Promise.all([
    readEntry(root, slug),
    readEntryCatalog(root, slug),
    readEntryValidation(root, slug)
  ]);
  return {
    slug,
    catalogEntry,
    validation,
    publicationStatus: entry.publicationStatus,
    driftStatus: entry.driftStatus,
    source: entry.source,
    snapshot: entry.snapshot
  };
}
