import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { buildRegistry, importSource, publishEntry } from '../src/workflow.js';
import { startRegistryServer } from '../src/server.js';
import { createGitRepoFromFixture, tempDir, writeRegistryConfig, writeSources } from './helpers.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

describe('serve HTTP endpoint adapter', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('serves ai-catalog.json and POST /search over HTTP', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'simple-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'web-access', type: 'git_repository', url: repo, path: 'SKILL.md', trackingRef: 'main' }]);

    await importSource('web-access', root);
    await publishEntry('web-access', root, { publishedBy: 'tester' });
    await buildRegistry(root);

    const running = await startRegistryServer(root, { port: 0 });
    server = running.server;

    const catalogRes = await fetch(`${running.url}/.well-known/ai-catalog.json`);
    expect(catalogRes.status).toBe(200);
    expect(catalogRes.headers.get('access-control-allow-origin')).toBe('*');
    const catalog = await catalogRes.json();
    expect(catalog.specVersion).toBe('1.0');
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0].displayName).toBe('Web Access');

    const searchRes = await fetch(`${running.url}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'browse web page', limit: 5 })
    });
    expect(searchRes.status).toBe(200);
    const search = await searchRes.json();
    expect(search.query).toBe('browse web page');
    expect(search.results[0].slug).toBe('web-access');

    const healthRes = await fetch(`${running.url}/health`);
    expect(healthRes.status).toBe(200);
    expect((await healthRes.json()).entries).toBe(1);
  });

  it('rejects empty search queries and unknown routes', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'simple-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'web-access', type: 'git_repository', url: repo, path: 'SKILL.md', trackingRef: 'main' }]);
    await importSource('web-access', root);
    await publishEntry('web-access', root, { publishedBy: 'tester' });
    await buildRegistry(root);

    const running = await startRegistryServer(root, { port: 0 });
    server = running.server;

    const emptyQuery = await fetch(`${running.url}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '   ' })
    });
    expect(emptyQuery.status).toBe(400);

    const notFound = await fetch(`${running.url}/nope`);
    expect(notFound.status).toBe(404);
  });
});
