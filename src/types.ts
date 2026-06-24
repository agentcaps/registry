export type SourceType = 'git_repository' | 'direct_url';
export type PublicationStatus = 'imported' | 'published' | 'revoked';
export type DriftStatus = 'unknown' | 'clean' | 'drifted' | 'unsupported';

export interface RegistryConfig {
  name: string;
  identifier: string;
  baseUrl?: string;
  documentationUrl?: string;
  skillMediaType?: string;
  excludeDriftedFromCatalog?: boolean;
}

export interface CatalogEntryCuration {
  displayName?: string;
  description?: string;
  tags?: string[];
  capabilities?: string[];
  representativeQueries?: string[];
  version?: string;
  trustManifest?: Record<string, unknown>;
}

export interface SourceDefinition {
  slug: string;
  type: SourceType;
  url: string;
  path?: string;
  trackingRef?: string;
  curation?: {
    category?: string;
    reason?: string;
    seoKeywords?: string[];
    catalogEntry?: CatalogEntryCuration;
  };
}

export interface SourcesFile {
  sources: SourceDefinition[];
}

export interface SourceSnapshot {
  sourceType: SourceType;
  sourceUrl: string;
  sourceRepositoryUrl?: string;
  sourceWebUrl?: string;
  sourceCommit?: string;
  trackingRef?: string;
  artifactPath: string;
  pinnedArtifactUrl: string;
  rawArtifactUrl: string;
  sourceDigest: string;
  fetchedAt: string;
}

export interface SkillDocument {
  name: string;
  description?: string;
  tags: string[];
  capabilities: string[];
  representativeQueries: string[];
  version?: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface CatalogEntry {
  identifier: string;
  displayName: string;
  type: string;
  url?: string;
  data?: Record<string, unknown>;
  description?: string;
  tags?: string[];
  capabilities?: string[];
  representativeQueries?: string[];
  version?: string;
  updatedAt?: string;
  trustManifest?: Record<string, unknown>;
}

export interface ValidationFinding {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationReport {
  score: number;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
  info: ValidationFinding[];
  summary: string;
}

export interface PublicationRecord {
  publishedBy?: string;
  publishedAt?: string;
  externalApprovalRef?: string;
  publicationNote?: string;
}

export interface RegistryEntryFile {
  slug: string;
  entryId: string;
  publicationStatus: PublicationStatus;
  driftStatus: DriftStatus;
  source: SourceDefinition;
  snapshot: SourceSnapshot;
  publication?: PublicationRecord;
}

export interface ListingDocument {
  slug: string;
  catalogEntry: CatalogEntry;
  validation: ValidationReport;
  publicationStatus: PublicationStatus;
  driftStatus: DriftStatus;
  source: SourceDefinition;
  snapshot: SourceSnapshot;
}

export interface AICatalogManifest {
  specVersion: '1.0';
  host: {
    displayName: string;
    identifier?: string;
    documentationUrl?: string;
  };
  entries: CatalogEntry[];
}

export interface SearchDocument {
  slug: string;
  catalogEntry: CatalogEntry;
  fields: Record<string, string[]>;
  source: {
    url: string;
    path?: string;
  };
}

export interface SearchIndexData {
  version: 1;
  generatedAt: string;
  documents: SearchDocument[];
  averageDocumentLength: number;
  documentCount: number;
  documentFrequencies: Record<string, number>;
}

export interface SearchResult {
  slug: string;
  score: number;
  catalogEntry: CatalogEntry;
  matchReasons: string[];
  source: SearchDocument['source'];
}

export interface DriftReport {
  slug: string;
  status: DriftStatus;
  checkedAt: string;
  previousCommit?: string;
  latestCommit?: string;
  message: string;
}
