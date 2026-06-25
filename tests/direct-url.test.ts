import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkDrift, importSource } from '../src/workflow.js';
import { readEntryCatalog } from '../src/storage.js';
import { tempDir, writeRegistryConfig, writeSources } from './helpers.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

describe('direct URL source', () => {
  it('imports direct SKILL.md URLs and detects drift by content digest', async () => {
    const root = join(tempDir(), '.agentcaps');
    const skillUrl = pathToFileURL(join(fixtures, 'direct-url', 'skill.md')).toString();
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'direct-skill', type: 'direct_url', url: skillUrl, path: 'SKILL.md' }]);

    await importSource('direct-skill', root);
    const catalogEntry = await readEntryCatalog(root, 'direct-skill');
    expect(catalogEntry.displayName).toBe('Direct URL Skill');
    expect(catalogEntry.url).toBe(skillUrl);

    // Unchanged local content digests to the published snapshot -> clean.
    const drift = await checkDrift('direct-skill', root);
    expect(drift.status).toBe('clean');
    expect(drift.sourceType).toBe('direct_url');
    expect(drift.latestDigest).toBe(drift.previousDigest);
  });
});
