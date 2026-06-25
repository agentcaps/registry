import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { checkUrlReachability, validateCatalogEntry, validateCatalogEntryWithReachability } from '../src/validation.js';
import type { CatalogEntry } from '../src/types.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

function baseEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    identifier: 'urn:air:github.com:eze-is:web-access:skill:web-access',
    displayName: 'Web Access',
    type: 'application/ai-skill',
    url: 'https://raw.githubusercontent.com/eze-is/web-access/0123456789abcdef0123456789abcdef01234567/SKILL.md',
    description: 'Browse websites, fetch pages, and inspect web content from a coding agent reliably.',
    tags: ['web', 'research'],
    capabilities: ['web.fetch', 'web.inspect'],
    representativeQueries: ['browse a website from a coding agent', 'inspect a web page with an agent'],
    ...overrides
  };
}

function codes(report: ReturnType<typeof validateCatalogEntry>): string[] {
  return [...report.errors, ...report.warnings, ...report.info].map((f) => f.code);
}

describe('validation quality rules', () => {
  it('gives a clean, well-formed entry a high score with no quality warnings', () => {
    const report = validateCatalogEntry(baseEntry());
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(codes(report)).not.toContain('capability-format');
    expect(codes(report)).not.toContain('tags-duplicate');
    expect(codes(report)).not.toContain('representative-queries-quality');
  });

  it('flags malformed capability labels', () => {
    const report = validateCatalogEntry(baseEntry({ capabilities: ['web.fetch', 'BadLabel', 'nonamespace'] }));
    const finding = report.warnings.find((f) => f.code === 'capability-format');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('BadLabel');
    expect(finding?.message).toContain('nonamespace');
  });

  it('flags duplicate and unnormalized tags', () => {
    const report = validateCatalogEntry(baseEntry({ tags: ['Web', 'web', ' research '] }));
    expect(codes(report)).toContain('tags-duplicate');
    expect(codes(report)).toContain('tags-normalize');
  });

  it('flags too-short and duplicate representative queries', () => {
    const report = validateCatalogEntry(baseEntry({ representativeQueries: ['short', 'short', 'tiny'] }));
    expect(codes(report)).toContain('representative-queries-quality');
    expect(codes(report)).toContain('representative-queries-duplicate');
  });

  it('warns when there are more than five representative queries', () => {
    const report = validateCatalogEntry(baseEntry({
      representativeQueries: [
        'browse a website from a coding agent',
        'inspect a web page with an agent',
        'download an article for later reading',
        'extract the main content of a page',
        'follow links to gather related pages',
        'summarize a long web document'
      ]
    }));
    const finding = report.warnings.find((f) => f.code === 'representative-queries');
    expect(finding?.message).toContain('trim');
  });

  it('flags a generic description', () => {
    const report = validateCatalogEntry(baseEntry({ description: 'A skill that helps you.' }));
    expect(codes(report)).toContain('description-generic');
  });

  it('reports reachable file URLs and missing artifacts', async () => {
    const reachable = await checkUrlReachability(pathToFileURL(join(fixtures, 'direct-url', 'skill.md')).toString());
    expect(reachable.severity).toBe('info');

    const missing = await checkUrlReachability(pathToFileURL(join(fixtures, 'direct-url', 'does-not-exist.md')).toString());
    expect(missing.severity).toBe('warning');
  });

  it('appends a reachability finding to the report', async () => {
    const report = await validateCatalogEntryWithReachability(
      baseEntry({ url: pathToFileURL(join(fixtures, 'direct-url', 'skill.md')).toString() })
    );
    expect(codes(report)).toContain('url-reachability');
  });
});
