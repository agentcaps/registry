#!/usr/bin/env node
// End-to-end CLI smoke test against the COMPILED dist/cli.js, the same artifact
// published to npm. Exercises the full registry lifecycle with a local direct_url
// source (no network or git required) so it is safe to run in CI.
//
//   init -> import -> validate -> publish -> build -> search -> serve
//
// Exits non-zero on the first failed expectation.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cli = join(repoRoot, 'dist', 'cli.js');

if (!existsSync(cli)) {
  console.error(`Missing ${cli}. Run "pnpm build" first.`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'agentcaps-smoke-'));
const root = join(work, '.agentcaps');
const skillPath = join(work, 'SKILL.md');

writeFileSync(
  skillPath,
  `---
name: Smoke Skill
description: A smoke-test skill that imports a local SKILL.md and exercises the full registry lifecycle end to end.
tags: [smoke, fixture, registry]
capabilities: [smoke.import, smoke.build]
representativeQueries:
  - run the registry smoke test lifecycle
  - import a local skill document into the catalog
  - build and search a registry from a single skill
---

# Smoke Skill

Local fixture used to verify the published CLI works end to end.
`,
  'utf8'
);

function run(...args) {
  return execFileSync('node', [cli, '--root', root, ...args], { encoding: 'utf8' });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`SMOKE FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`ok - ${message}`);
}

run('init');
assert(existsSync(join(root, 'sources.yaml')), 'init created sources.yaml');

writeFileSync(
  join(root, 'sources.yaml'),
  `sources:
  - slug: smoke-skill
    type: direct_url
    url: ${skillPath}
    path: SKILL.md
`,
  'utf8'
);

run('import', '--all');
const validateOut = run('validate', '--all');
assert(/smoke-skill: \d+\/100/.test(validateOut), 'validate reported a score');

run('publish', '--all', '--by', 'smoke@agentcaps.dev');
run('build');

const manifestPath = join(root, 'dist', 'ai-catalog.json');
assert(existsSync(manifestPath), 'build produced ai-catalog.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert(manifest.entries.length === 1, 'catalog contains exactly the one published entry');
assert(manifest.entries[0].displayName === 'Smoke Skill', 'catalog entry has the expected displayName');

const searchOut = run('search', 'build and search a registry');
assert(searchOut.includes('smoke-skill'), 'search returned the published slug');

// Verify the HTTP serve adapter responds on an ephemeral port.
const { startRegistryServer } = await import(join(repoRoot, 'dist', 'server.js'));
const running = await startRegistryServer(root, { port: 0 });

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: running.host, port: running.port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

try {
  const catalogRes = await httpGet('/.well-known/ai-catalog.json');
  assert(catalogRes.status === 200, 'serve responded 200 for /.well-known/ai-catalog.json');
  assert(JSON.parse(catalogRes.body).entries.length === 1, 'served catalog contains the published entry');
} finally {
  await new Promise((resolve) => running.server.close(resolve));
}

console.log('SMOKE PASSED');
