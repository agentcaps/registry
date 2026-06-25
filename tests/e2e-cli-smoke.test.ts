import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import { runCli } from '../src/cli.js';
import { createGitRepoFromFixture, tempDir } from './helpers.js';
import type { AICatalogManifest, SourcesFile } from '../src/types.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

/**
 * Mirrors the CI smoke flow end to end through the CLI surface:
 * init -> import -> validate -> publish -> build -> search.
 */
describe('end-to-end CLI workflow smoke', () => {
  it('runs the full init->import->validate->publish->build->search lifecycle', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'simple-skill'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const cli = (...args: string[]) => runCli(['node', 'agentcaps-registry', '--root', root, ...args]);

    await cli('init');
    expect(existsSync(join(root, 'registry.yaml'))).toBe(true);
    expect(existsSync(join(root, 'sources.yaml'))).toBe(true);

    // Add a source the way a user would, then import via --all.
    const sources: SourcesFile = { sources: [{ slug: 'web-access', type: 'git_repository', url: repo, path: 'SKILL.md', trackingRef: 'main' }] };
    await writeFile(join(root, 'sources.yaml'), YAML.stringify(sources), 'utf8');

    await cli('import', '--all');
    await cli('validate', '--all');
    await cli('publish', '--all', '--by', 'smoke@agentcaps.dev');
    await cli('build');
    await cli('search', 'browse a website');

    expect(existsSync(join(root, 'dist', 'ai-catalog.json'))).toBe(true);
    expect(existsSync(join(root, 'dist', 'search-index.json'))).toBe(true);
    expect(existsSync(join(root, 'dist', 'listings', 'web-access.json'))).toBe(true);

    const manifest = JSON.parse(await readFile(join(root, 'dist', 'ai-catalog.json'), 'utf8')) as AICatalogManifest;
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].displayName).toBe('Web Access');

    // The search command prints a result set that includes the published slug.
    const printed = log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(printed).toContain('web-access');
    log.mockRestore();
  });
});
