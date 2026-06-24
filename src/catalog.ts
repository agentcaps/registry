import { DEFAULT_SKILL_MEDIA_TYPE } from './constants.js';
import type { CatalogEntry, CatalogEntryCuration, RegistryConfig, SourceDefinition, SourceSnapshot, SkillDocument } from './types.js';
import { parseGitHubRepoUrl, repoNameFromUrl, slugify, sourceHost, urnSegment } from './utils.js';

export function buildCatalogIdentifier(source: SourceDefinition, skill: SkillDocument): string {
  const host = sourceHost(source.url);
  const github = parseGitHubRepoUrl(source.url);
  const skillPart = slugify(skill.name || source.path || 'root');
  if (github) {
    return `urn:air:${host}:${urnSegment(github.owner)}:${urnSegment(github.repo)}:skill:${urnSegment(skillPart)}`;
  }
  return `urn:air:${host}:${urnSegment(repoNameFromUrl(source.url))}:skill:${urnSegment(skillPart)}`;
}

export function buildCatalogEntry(input: {
  source: SourceDefinition;
  snapshot: SourceSnapshot;
  skill: SkillDocument;
  config?: RegistryConfig;
}): CatalogEntry {
  const { source, snapshot, skill, config } = input;
  const entry: CatalogEntry = {
    identifier: buildCatalogIdentifier(source, skill),
    displayName: skill.name,
    type: config?.skillMediaType ?? DEFAULT_SKILL_MEDIA_TYPE,
    url: snapshot.rawArtifactUrl,
    description: skill.description,
    tags: skill.tags.length ? skill.tags : undefined,
    capabilities: skill.capabilities.length ? skill.capabilities : undefined,
    representativeQueries: skill.representativeQueries.length ? skill.representativeQueries : undefined,
    version: skill.version,
    updatedAt: snapshot.fetchedAt
  };

  return compactCatalogEntry(applyCatalogEntryCuration(entry, source.curation?.catalogEntry));
}

function compactCatalogEntry(entry: CatalogEntry): CatalogEntry {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as CatalogEntry;
}

function curatedArray(value?: string[]): string[] | undefined {
  const normalized = value?.map((item) => item.trim()).filter(Boolean);
  return normalized?.length ? normalized : undefined;
}

export function applyCatalogEntryCuration(entry: CatalogEntry, curation?: CatalogEntryCuration): CatalogEntry {
  if (!curation) return entry;

  const curated: CatalogEntry = {
    ...entry,
    displayName: curation.displayName?.trim() || entry.displayName,
    description: curation.description?.trim() || entry.description,
    tags: curatedArray(curation.tags) ?? entry.tags,
    capabilities: curatedArray(curation.capabilities) ?? entry.capabilities,
    representativeQueries: curatedArray(curation.representativeQueries) ?? entry.representativeQueries,
    version: curation.version?.trim() || entry.version,
    trustManifest: curation.trustManifest ?? entry.trustManifest
  };

  return curated;
}
