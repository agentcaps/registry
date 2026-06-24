#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import {
  buildRegistry,
  checkAllDrift,
  checkDrift,
  importAll,
  importSource,
  initRegistry,
  publishEntry,
  revokeEntry,
  searchBuiltIndex,
  validateEntry
} from './workflow.js';
import { DEFAULT_REGISTRY_DIR } from './constants.js';
import { listEntrySlugs, loadSources } from './storage.js';

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
      await importSource(slug, root);
      console.log(`Imported ${slug}.`);
    });

  program.command('validate')
    .argument('[slug]')
    .option('--all', 'validate all entries')
    .action(async (slug: string | undefined, options: { all?: boolean }) => {
      const root = rootOption(program.opts().root);
      if (options.all) {
        const sources = await loadSources(root);
        for (const source of sources.sources) {
          const report = await validateEntry(source.slug, root);
          console.log(`${source.slug}: ${report.score}/100`);
        }
        return;
      }
      if (!slug) throw new Error('Provide a slug or --all.');
      const report = await validateEntry(slug, root);
      console.log(`${slug}: ${report.score}/100`);
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
    .action(async (slug: string | undefined, options: { all?: boolean }) => {
      const root = rootOption(program.opts().root);
      if (options.all) {
        const reports = await checkAllDrift(root);
        for (const report of reports) console.log(`${report.slug}: ${report.status}`);
        return;
      }
      if (!slug) throw new Error('Provide a slug or --all.');
      const report = await checkDrift(slug, root);
      console.log(`${report.slug}: ${report.status}`);
    });

  program.command('build').action(async () => {
    const manifest = await buildRegistry(rootOption(program.opts().root));
    console.log(`Built registry with ${manifest.entries.length} published entr${manifest.entries.length === 1 ? 'y' : 'ies'}.`);
  });

  program.command('search')
    .argument('<query>')
    .option('-l, --limit <number>', 'result limit', '10')
    .action(async (query: string, options: { limit: string }) => {
      const results = await searchBuiltIndex(rootOption(program.opts().root), query, Number(options.limit));
      console.log(JSON.stringify({ results }, null, 2));
    });

  await program.parseAsync(argv);
}

if (isDirectCliInvocation()) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
