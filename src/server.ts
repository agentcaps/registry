import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile } from './storage.js';
import { searchIndex } from './search.js';
import type { AICatalogManifest, SearchIndexData } from './types.js';

export const WELL_KNOWN_CATALOG_PATH = '/.well-known/ai-catalog.json';

export interface ServeOptions {
  host?: string;
  port?: number;
}

export interface RunningServer {
  server: Server;
  host: string;
  port: number;
  url: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;

/**
 * Resolve the directory that holds the built artifacts. Accepts either a registry
 * root (artifacts under `<root>/dist`) or a `dist` directory directly, so both
 * `serve .agentcaps` and `serve .agentcaps/dist` work.
 */
function resolveDistDir(target: string): string {
  if (existsSync(join(target, 'ai-catalog.json'))) return target;
  return join(target, 'dist');
}

async function loadArtifacts(target: string): Promise<{ manifest: AICatalogManifest; index: SearchIndexData }> {
  const distDir = resolveDistDir(target);
  const manifestPath = join(distDir, 'ai-catalog.json');
  const indexPath = join(distDir, 'search-index.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No ai-catalog.json found under ${distDir}. Run "agentcaps-registry build" first.`);
  }
  const manifest = await readJsonFile<AICatalogManifest>(manifestPath);
  const index = existsSync(indexPath)
    ? await readJsonFile<SearchIndexData>(indexPath)
    : ({ version: 1, generatedAt: new Date().toISOString(), documents: [], averageDocumentLength: 0, documentCount: 0, documentFrequencies: {} } as SearchIndexData);
  return { manifest, index };
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Build a minimal ARD-compatible HTTP server over built static artifacts:
 *   GET  /.well-known/ai-catalog.json  -> the AICatalog manifest
 *   POST /search                       -> { query, results } from the BM25 index
 *   GET  /health                       -> liveness + entry count
 * Artifacts are read once at startup; rebuild and restart to pick up changes.
 */
export async function createRegistryServer(target: string): Promise<Server> {
  const { manifest, index } = await loadArtifacts(target);

  return createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', 'http://localhost');
      const pathname = url.pathname;

      if (method === 'OPTIONS') {
        setCors(res);
        res.writeHead(204);
        res.end();
        return;
      }

      if (method === 'GET' && (pathname === WELL_KNOWN_CATALOG_PATH || pathname === '/ai-catalog.json')) {
        sendJson(res, 200, manifest);
        return;
      }

      if (method === 'GET' && pathname === '/health') {
        sendJson(res, 200, { status: 'ok', entries: manifest.entries.length });
        return;
      }

      if (method === 'POST' && pathname === '/search') {
        const raw = await readBody(req);
        let payload: { query?: string; limit?: number } = {};
        if (raw.trim()) {
          try {
            payload = JSON.parse(raw) as { query?: string; limit?: number };
          } catch {
            sendJson(res, 400, { error: 'Invalid JSON body.' });
            return;
          }
        }
        const query = String(payload.query ?? url.searchParams.get('q') ?? '').trim();
        if (!query) {
          sendJson(res, 400, { error: 'Provide a non-empty "query".' });
          return;
        }
        const limit = Number(payload.limit ?? url.searchParams.get('limit') ?? 10) || 10;
        const results = searchIndex(index, query, limit);
        sendJson(res, 200, { query, results });
        return;
      }

      sendJson(res, 404, {
        error: 'Not found',
        routes: [`GET ${WELL_KNOWN_CATALOG_PATH}`, 'POST /search', 'GET /health']
      });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export async function startRegistryServer(target: string, options: ServeOptions = {}): Promise<RunningServer> {
  const server = await createRegistryServer(target);
  const host = options.host ?? DEFAULT_HOST;
  const requestedPort = options.port ?? DEFAULT_PORT;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  return { server, host, port, url: `http://${host}:${port}` };
}
