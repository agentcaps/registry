import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { checkDrift, importSource, publishEntry } from '../src/workflow.js';
import { readEntry } from '../src/storage.js';
import { commitChange, createGitRepoFromFixture, tempDir, writeRegistryConfig, writeSources } from './helpers.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

describe('drift detection', () => {
  it('marks a published git entry as drifted without replacing the published snapshot', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'simple-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'web-access', type: 'git_repository', url: repo, path: 'SKILL.md', trackingRef: 'main' }]);

    await importSource('web-access', root);
    await publishEntry('web-access', root);
    const before = await readEntry(root, 'web-access');

    const latestCommit = commitChange(repo, 'SKILL.md', `${before.snapshot.sourceDigest}\n# Updated Skill\n`);
    const drift = await checkDrift('web-access', root);
    const after = await readEntry(root, 'web-access');

    expect(drift.status).toBe('drifted');
    expect(drift.latestCommit).toBe(latestCommit);
    expect(after.driftStatus).toBe('drifted');
    expect(after.snapshot.sourceCommit).toBe(before.snapshot.sourceCommit);
    expect(after.snapshot.sourceDigest).toBe(before.snapshot.sourceDigest);
  });
});
