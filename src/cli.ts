#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import {
  buildRegistry,
  checkAllDrift,
  checkDrift,
  importAll,
  importSourceEntries,
  initRegistry,
  publishEntry,
  revokeEntry,
  searchBuiltIndex,
  validateEntry
} from './workflow.js';
import { DEFAULT_REGISTRY_DIR } from './constants.js';
import { listEntrySlugs } from './storage.js';
import { startRegistryServer } from './server.js';

function rootOption(value?: string): string {
  return value ?? DEFAULT_REGISTRY_DIR;
}

function isDirectCliInvocation(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    return realpathSync(invokedPath) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = new Command();
  program
    .name('agentcaps-registry')
    .description('File-first ARD registry for approved agent capabilities')
    .option('-r, --root <path>', 'registry root directory', DEFAULT_REGISTRY_DIR);

  program.command('init').action(async () => {
    await initRegistry(rootOption(program.opts().root));
    console.log(`Initialized registry at ${rootOption(program.opts().root)}`);
  });

  program.command('import')
    .argument('[slug]')
    .option('--all', 'import all sources')
    .action(async (slug: string | undefined, options: { all?: boolean }) => {
      const root = rootOption(program.opts().root);
      if (options.all) {
        const results = await importAll(root);
        console.log(`Imported ${results.length} source(s).`);
        return;
      }
      if (!slug) throw new Error('Provide a slug or --all.');
      const results = await importSourceEntries(slug, root);
      console.log(results.length === 1 ? `Imported ${results[0].slug}.` : `Imported ${results.length} entries from ${slug}.`);
    });

  program.command('validate')
    .argument('[slug]')
    .option('--all', 'validate all entries')
    .option('--check-urls', 'also check CatalogEntry.url reachability over the network')
    .option('--timeout <ms>', 'URL reachability timeout in milliseconds', '5000')
    .option('--json', 'output machine-readable JSON')
    .option('--min-score <score>', 'fail (non-zero exit) if any entry scores below this threshold')
    .action(async (slug: string | undefined, options: { all?: boolean; checkUrls?: boolean; timeout?: string; json?: boolean; minScore?: string }) => {
      const root = rootOption(program.opts().root);
      const validateOptions = { checkUrls: options.checkUrls, timeoutMs: Number(options.timeout) };
      if (!options.all && !slug) throw new Error('Provide a slug or --all.');
      const slugs = options.all ? await listEntrySlugs(root) : [slug as string];
      const results = [];
      for (const entrySlug of slugs) {
        results.push({ slug: entrySlug, ...(await validateEntry(entrySlug, root, validateOptions)) });
      }
      const minScore = options.minScore !== undefined ? Number(options.minScore) : undefined;
      const failures = results.filter((r) => r.errors.length > 0 || (minScore !== undefined && r.score < minScore));
      if (options.json) {
        console.log(JSON.stringify({ ok: failures.length === 0, results }, null, 2));
      } else {
        for (const r of results) {
          const errorNote = r.errors.length ? ` (${r.errors.length} error${r.errors.length === 1 ? '' : 's'})` : '';
          console.log(`${r.slug}: ${r.score}/100${errorNote}`);
        }
      }
      if (failures.length) {
        if (!options.json) console.error(`Validation gate failed for ${failures.length} entr${failures.length === 1 ? 'y' : 'ies'}.`);
        process.exitCode = 1;
      }
    });

  program.command('publish')
    .argument('[slug]')
    .option('--all', 'publish all imported entries')
    .option('--by <identity>', 'publisher identity')
    .option('--external-approval-ref <url>', 'external approval reference')
    .option('--note <note>', 'publication note')
    .action(async (slug: string | undefined, options: { all?: boolean; by?: string; externalApprovalRef?: string; note?: string }) => {
      const root = rootOption(program.opts().root);
      const publication = {
        publishedBy: options.by,
        externalApprovalRef: options.externalApprovalRef,
        publicationNote: options.note
      };
      if (options.all) {
        const slugs = await listEntrySlugs(root);
        for (const entrySlug of slugs) await publishEntry(entrySlug, root, publication);
        console.log(`Published ${slugs.length} entr${slugs.length === 1 ? 'y' : 'ies'}.`);
        return;
      }
      if (!slug) throw new Error('Provide a slug or --all.');
      await publishEntry(slug, root, publication);
      console.log(`Published ${slug}.`);
    });

  program.command('revoke')
    .argument('<slug>')
    .action(async (slug: string) => {
      await revokeEntry(slug, rootOption(program.opts().root));
      console.log(`Revoked ${slug}.`);
    });

  program.command('drift')
    .argument('[slug]')
    .option('--all', 'check all entries')
    .option('--json', 'output machine-readable JSON')
    .option('--ci', 'exit with a non-zero code if any entry has drifted')
    .action(async (slug: string | undefined, options: { all?: boolean; json?: boolean; ci?: boolean }) => {
      const root = rootOption(program.opts().root);
      if (!options.all && !slug) throw new Error('Provide a slug or --all.');
      const reports = options.all ? await checkAllDrift(root) : [await checkDrift(slug as string, root)];
      if (options.json) {
        console.log(JSON.stringify({ reports }, null, 2));
      } else {
        for (const report of reports) console.log(`${report.slug}: ${report.status}`);
      }
      if (options.ci && reports.some((report) => report.status === 'drifted')) {
        if (!options.json) console.error('Drift detected in one or more published entries.');
        process.exitCode = 1;
      }
    });

  program.command('build')
    .option('--exclude-drifted', 'exclude entries marked as drifted from the built catalog')
    .option('--json', 'output machine-readable JSON')
    .action(async (options: { excludeDrifted?: boolean; json?: boolean }) => {
      const manifest = await buildRegistry(rootOption(program.opts().root), { excludeDrifted: options.excludeDrifted });
      if (options.json) {
        console.log(JSON.stringify({ entries: manifest.entries.length, host: manifest.host }, null, 2));
      } else {
        console.log(`Built registry with ${manifest.entries.length} published entr${manifest.entries.length === 1 ? 'y' : 'ies'}.`);
      }
    });

  program.command('search')
    .argument('<query>')
    .option('-l, --limit <number>', 'result limit', '10')
    .action(async (query: string, options: { limit: string }) => {
      const results = await searchBuiltIndex(rootOption(program.opts().root), query, Number(options.limit));
      console.log(JSON.stringify({ results }, null, 2));
    });

  program.command('serve')
    .description('Serve built registry artifacts over an ARD-compatible HTTP endpoint')
    .argument('[dir]', 'registry root or dist directory to serve (defaults to --root)')
    .option('-p, --port <number>', 'port to listen on', '8787')
    .option('-H, --host <host>', 'host to bind', '127.0.0.1')
    .action(async (dir: string | undefined, options: { port: string; host: string }) => {
      const target = dir ?? rootOption(program.opts().root);
      const { url } = await startRegistryServer(target, { host: options.host, port: Number(options.port) });
      console.log(`AgentCaps registry serving ${target} at ${url}`);
      console.log(`  GET  ${url}/.well-known/ai-catalog.json`);
      console.log(`  POST ${url}/search   body: {"query":"...","limit":10}`);
      console.log('Press Ctrl+C to stop.');
    });

  await program.parseAsync(argv);
}

if (isDirectCliInvocation()) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
