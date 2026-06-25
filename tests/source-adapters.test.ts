import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globToRegExp } from '../src/source.js';
import { importSourceEntries } from '../src/workflow.js';
import { tempDir, writeRegistryConfig, writeSources } from './helpers.js';

function skillDoc(name: string): string {
  return `---\nname: ${name}\ndescription: A ${name} skill fixture used to validate collection source globbing behavior end to end.\ntags: [fixture]\ncapabilities: [fixture.run]\n---\n\n# ${name}\n`;
}

function gitRepoWith(files: Record<string, string>): string {
  const repo = tempDir('agentcaps-repo-');
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(repo, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'AgentCaps Test'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
  return repo;
}

describe('globToRegExp', () => {
  it('matches a single path segment with *', () => {
    const re = globToRegExp('skills/*/SKILL.md');
    expect(re.test('skills/pdf/SKILL.md')).toBe(true);
    expect(re.test('skills/a/b/SKILL.md')).toBe(false);
  });

  it('matches zero or more segments with **/', () => {
    const re = globToRegExp('**/SKILL.md');
    expect(re.test('SKILL.md')).toBe(true);
    expect(re.test('a/SKILL.md')).toBe(true);
    expect(re.test('a/b/c/SKILL.md')).toBe(true);
    expect(re.test('a/SKILL.txt')).toBe(false);
  });

  it('expands brace alternation', () => {
    const re = globToRegExp('skills/*/SKILL.{md,markdown}');
    expect(re.test('skills/a/SKILL.md')).toBe(true);
    expect(re.test('skills/a/SKILL.markdown')).toBe(true);
    expect(re.test('skills/a/SKILL.txt')).toBe(false);
  });
});

describe('collection source globbing', () => {
  it('honors exclude globs and ignores node_modules by default', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = gitRepoWith({
      'SKILL.md': skillDoc('Root Skill'),
      'skills/alpha/SKILL.md': skillDoc('Alpha'),
      'skills/templates/SKILL.md': skillDoc('Template'),
      'node_modules/pkg/SKILL.md': skillDoc('Vendored')
    });
    writeRegistryConfig(root);
    writeSources(root, [{
      slug: 'col',
      type: 'git_repository_collection',
      url: repo,
      include: ['**/SKILL.md'],
      exclude: ['skills/templates/**'],
      trackingRef: 'main'
    }]);

    const entries = await importSourceEntries('col', root);
    const slugs = entries.map((entry) => entry.slug).sort();

    expect(slugs).toContain('col-alpha');
    expect(slugs).toContain('col-skill'); // root SKILL.md via **/ zero-segment match
    expect(slugs.some((slug) => slug.includes('template'))).toBe(false); // excluded
    expect(slugs.some((slug) => slug.includes('pkg') || slug.includes('vendored'))).toBe(false); // node_modules ignored
  });
});
