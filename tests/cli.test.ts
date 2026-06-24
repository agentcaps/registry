import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { runCli } from '../src/cli.js';
import { createGitRepoFromFixture, tempDir, writeRegistryConfig, writeSources } from './helpers.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

describe('agentcaps-registry CLI', () => {
  it('runs import, publish, build, and search against file-first storage', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'simple-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'web-access', type: 'git_repository', url: repo, path: 'SKILL.md', trackingRef: 'main' }]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runCli(['node', 'agentcaps-registry', '--root', root, 'import', 'web-access']);
    await runCli(['node', 'agentcaps-registry', '--root', root, 'publish', 'web-access', '--by', 'tester']);
    await runCli(['node', 'agentcaps-registry', '--root', root, 'build']);
    await runCli(['node', 'agentcaps-registry', '--root', root, 'search', 'browse website']);

    expect(existsSync(join(root, 'dist', 'ai-catalog.json'))).toBe(true);
    expect(existsSync(join(root, 'dist', 'search-index.json'))).toBe(true);
    expect(log.mock.calls.some((call) => String(call[0]).includes('web-access'))).toBe(true);
    log.mockRestore();
  });
});
