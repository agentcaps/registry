import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import type { SourceDefinition } from '../src/types.js';

export function tempDir(prefix = 'agentcaps-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function createGitRepoFromFixture(fixturePath: string): string {
  const repo = tempDir('agentcaps-repo-');
  cpSync(fixturePath, repo, { recursive: true });
  execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'AgentCaps Test'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'initial skill'], { cwd: repo, stdio: 'ignore' });
  return repo;
}

export function commitChange(repo: string, file: string, content: string): string {
  writeFileSync(join(repo, file), content);
  execFileSync('git', ['add', file], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'update skill'], { cwd: repo, stdio: 'ignore' });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
}

export function writeRegistryConfig(root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'registry.yaml'), YAML.stringify({
    name: 'Test Registry',
    identifier: 'urn:air:test.local:registry:default',
    skillMediaType: 'application/ai-skill',
    excludeDriftedFromCatalog: false
  }));
}

export function writeSources(root: string, sources: SourceDefinition[]): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'sources.yaml'), YAML.stringify({ sources }));
}
