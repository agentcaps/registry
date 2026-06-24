import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { buildRegistry, importSource, publishEntry, revokeEntry, searchBuiltIndex } from '../src/workflow.js';
import { readJsonFile } from '../src/storage.js';
import type { AICatalogManifest } from '../src/types.js';
import { createGitRepoFromFixture, tempDir, writeRegistryConfig, writeSources } from './helpers.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

describe('publication gate, build, and search', () => {
  it('builds only published entries and searches the static BM25 index', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'simple-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'web-access', type: 'git_repository', url: repo, path: 'SKILL.md', trackingRef: 'main' }]);

    await importSource('web-access', root);
    let manifest = await buildRegistry(root);
    expect(manifest.entries).toHaveLength(0);

    await publishEntry('web-access', root, { publishedBy: 'tester', externalApprovalRef: 'https://github.com/company/catalog/pull/1' });
    manifest = await buildRegistry(root);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].displayName).toBe('Web Access');

    const distManifest = await readJsonFile<AICatalogManifest>(join(root, 'dist', 'ai-catalog.json'));
    expect(distManifest.entries).toHaveLength(1);

    const results = await searchBuiltIndex(root, 'browse web page', 5);
    expect(results[0].slug).toBe('web-access');
    expect(results[0].matchReasons.length).toBeGreaterThan(0);

    await revokeEntry('web-access', root);
    manifest = await buildRegistry(root);
    expect(manifest.entries).toHaveLength(0);
  });
});
