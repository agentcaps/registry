import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { checkDrift, importSource, publishEntry } from '../src/workflow.js';
import { readEntry } from '../src/storage.js';
import { commitChange, createGitRepoFromFixture, tempDir, writeRegistryConfig, writeSources } from './helpers.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

function skillDoc(name: string): string {
  return `---\nname: ${name}\ndescription: A ${name} direct-url skill fixture for drift detection by content digest.\ntags: [fixture]\ncapabilities: [fixture.run]\n---\n\n# ${name}\n`;
}

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

  it('detects direct_url drift by content digest and reports unknown when unreachable', async () => {
    const work = tempDir('agentcaps-direct-');
    const root = join(work, '.agentcaps');
    const skillPath = join(work, 'SKILL.md');
    writeFileSync(skillPath, skillDoc('Direct Drift'));
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'direct-skill', type: 'direct_url', url: skillPath, path: 'SKILL.md' }]);

    await importSource('direct-skill', root);
    await publishEntry('direct-skill', root);

    const clean = await checkDrift('direct-skill', root);
    expect(clean.status).toBe('clean');

    writeFileSync(skillPath, skillDoc('Direct Drift Updated'));
    const drifted = await checkDrift('direct-skill', root);
    expect(drifted.status).toBe('drifted');
    expect(drifted.latestDigest).not.toBe(drifted.previousDigest);

    // Published snapshot must not be silently replaced.
    const after = await readEntry(root, 'direct-skill');
    expect(after.snapshot.sourceDigest).toBe(clean.previousDigest);

    rmSync(skillPath);
    const unreachable = await checkDrift('direct-skill', root);
    expect(unreachable.status).toBe('unknown');
  });
});
