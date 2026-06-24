import { describe, expect, it } from 'vitest';
import { buildCatalogEntry, buildCatalogIdentifier } from '../src/catalog.js';
import type { SourceDefinition, SourceSnapshot, SkillDocument } from '../src/types.js';

const source: SourceDefinition = {
  slug: 'web-access',
  type: 'git_repository',
  url: 'https://github.com/eze-is/web-access',
  path: 'SKILL.md',
  trackingRef: 'main'
};

const snapshot: SourceSnapshot = {
  sourceType: 'git_repository',
  sourceUrl: source.url,
  sourceRepositoryUrl: source.url,
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  trackingRef: 'main',
  artifactPath: 'SKILL.md',
  pinnedArtifactUrl: 'https://github.com/eze-is/web-access/blob/0123456789abcdef0123456789abcdef01234567/SKILL.md',
  rawArtifactUrl: 'https://raw.githubusercontent.com/eze-is/web-access/0123456789abcdef0123456789abcdef01234567/SKILL.md',
  sourceDigest: 'sha256:abc',
  fetchedAt: '2026-06-24T00:00:00.000Z'
};

const skill: SkillDocument = {
  name: 'Web Access',
  description: 'Browse websites, fetch pages, and inspect web content from a coding agent.',
  tags: ['web'],
  capabilities: ['web.fetch'],
  representativeQueries: ['browse a website from a coding agent', 'inspect a web page with an agent'],
  frontmatter: {},
  body: ''
};

describe('CatalogEntry builder', () => {
  it('uses source-derived identifiers and pinned raw artifact URLs', () => {
    const identifier = buildCatalogIdentifier(source, skill);
    const entry = buildCatalogEntry({ source, snapshot, skill });

    expect(identifier).toBe('urn:air:github.com:eze-is:web-access:skill:web-access');
    expect(entry.identifier).toBe(identifier);
    expect(entry.url).toBe(snapshot.rawArtifactUrl);
    expect(entry.url).toContain('/0123456789abcdef0123456789abcdef01234567/');
    expect(JSON.stringify(entry)).not.toContain('publicationStatus');
    expect(JSON.stringify(entry)).not.toContain('metadata');
  });

  it('applies reviewed curation as standard CatalogEntry fields only', () => {
    const entry = buildCatalogEntry({
      source: {
        ...source,
        curation: {
          reason: 'reviewed for a public reference registry',
          catalogEntry: {
            description: 'Curated description for a reviewed web access skill.',
            tags: ['web', 'research'],
            capabilities: ['web.fetch', 'web.inspect'],
            representativeQueries: ['fetch a page for research', 'inspect a website from an agent']
          }
        }
      },
      snapshot,
      skill: { ...skill, tags: [], capabilities: [], representativeQueries: [] }
    });

    expect(entry.description).toBe('Curated description for a reviewed web access skill.');
    expect(entry.tags).toEqual(['web', 'research']);
    expect(entry.capabilities).toEqual(['web.fetch', 'web.inspect']);
    expect(entry.representativeQueries).toEqual(['fetch a page for research', 'inspect a website from an agent']);
    expect(JSON.stringify(entry)).not.toContain('curation');
    expect(JSON.stringify(entry)).not.toContain('metadata');
  });
});
