import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { runCli } from '../src/cli.js';
import { commitChange, createGitRepoFromFixture, tempDir, writeRegistryConfig, writeSources } from './helpers.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

function lastJson(log: ReturnType<typeof vi.spyOn>): any {
  const printed = log.mock.calls.map((call) => String(call[0]));
  return JSON.parse(printed[printed.length - 1]);
}

describe('CI-friendly CLI output', () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it('validate --json reports results and --min-score gates with a non-zero exit', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'simple-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'web-access', type: 'git_repository', url: repo, path: 'SKILL.md', trackingRef: 'main' }]);
    const cli = (...args: string[]) => runCli(['node', 'agentcaps-registry', '--root', root, ...args]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await cli('import', '--all');

    process.exitCode = 0;
    log.mockClear();
    await cli('validate', '--all', '--json');
    const out = lastJson(log);
    expect(out.ok).toBe(true);
    expect(out.results[0].slug).toBe('web-access');
    expect(process.exitCode).toBe(0);

    process.exitCode = 0;
    await cli('validate', '--all', '--min-score', '200');
    expect(process.exitCode).toBe(1);
  });

  it('drift --ci exits non-zero on drift and build --exclude-drifted drops drifted entries', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'simple-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'web-access', type: 'git_repository', url: repo, path: 'SKILL.md', trackingRef: 'main' }]);
    const cli = (...args: string[]) => runCli(['node', 'agentcaps-registry', '--root', root, ...args]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await cli('import', '--all');
    await cli('publish', '--all', '--by', 'tester');

    process.exitCode = 0;
    await cli('drift', '--all', '--ci');
    expect(process.exitCode).toBe(0);

    commitChange(repo, 'SKILL.md', '# Updated\n');

    process.exitCode = 0;
    await cli('drift', '--all', '--ci');
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
    log.mockClear();
    await cli('build', '--exclude-drifted', '--json');
    expect(lastJson(log).entries).toBe(0);

    log.mockClear();
    await cli('build', '--json');
    expect(lastJson(log).entries).toBe(1);
  });
});
