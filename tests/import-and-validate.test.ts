import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { importSource, importSourceEntries } from '../src/workflow.js';
import { readEntryCatalog, readEntryValidation } from '../src/storage.js';
import { createGitRepoFromFixture, tempDir, writeRegistryConfig, writeSources } from './helpers.js';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

describe('import and validation pipeline', () => {
  it('imports a public git SKILL.md into a standard CatalogEntry without AgentCaps metadata', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'simple-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{ slug: 'web-access', type: 'git_repository', url: repo, path: 'SKILL.md', trackingRef: 'main' }]);

    const entry = await importSource('web-access', root);
    const catalogEntry = await readEntryCatalog(root, 'web-access');
    const validation = await readEntryValidation(root, 'web-access');

    expect(entry.publicationStatus).toBe('imported');
    expect(entry.driftStatus).toBe('unknown');
    expect(entry.snapshot.sourceDigest).toMatch(/^sha256:/);
    expect(entry.snapshot.rawArtifactUrl).toMatch(/^file:\/\//);
    expect(catalogEntry.identifier).toMatch(/^urn:air:local:/);
    expect(catalogEntry.displayName).toBe('Web Access');
    expect(catalogEntry.type).toBe('application/ai-skill');
    expect(catalogEntry.url).toBe(entry.snapshot.rawArtifactUrl);
    expect(catalogEntry.representativeQueries).toHaveLength(3);
    expect(JSON.stringify(catalogEntry)).not.toContain('metadata');
    expect(validation.score).toBeGreaterThanOrEqual(90);
    expect(validation.summary).toContain('not safety');

    const raw = readFileSync(join(root, 'entries', 'web-access', 'catalog-entry.json'), 'utf8');
    expect(raw).not.toContain('metadata.agentcaps');
  });

  it('fills missing ARD search fields from reviewed source curation', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'minimal-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{
      slug: 'frontend-slides',
      type: 'git_repository',
      url: repo,
      path: 'SKILL.md',
      trackingRef: 'main',
      curation: {
        reason: 'reviewed SKILL.md for presentation generation use cases',
        catalogEntry: {
          tags: ['slides', 'presentation', 'html', 'frontend'],
          capabilities: ['slides.create', 'slides.convert', 'html.generate'],
          representativeQueries: [
            'create an animated HTML presentation',
            'convert a PowerPoint deck into web slides',
            'generate polished frontend slides from notes'
          ]
        }
      }
    }]);

    await importSource('frontend-slides', root);
    const catalogEntry = await readEntryCatalog(root, 'frontend-slides');
    const validation = await readEntryValidation(root, 'frontend-slides');

    expect(catalogEntry.tags).toEqual(['slides', 'presentation', 'html', 'frontend']);
    expect(catalogEntry.capabilities).toEqual(['slides.create', 'slides.convert', 'html.generate']);
    expect(catalogEntry.representativeQueries).toHaveLength(3);
    expect(JSON.stringify(catalogEntry)).not.toContain('curation');
    expect(JSON.stringify(catalogEntry)).not.toContain('metadata');
    expect(validation.score).toBeGreaterThanOrEqual(90);
  });

  it('imports a git repository collection into one entry per matched SKILL.md', async () => {
    const root = join(tempDir(), '.agentcaps');
    const repo = createGitRepoFromFixture(join(fixtures, 'git-repos', 'collection-skill'));
    writeRegistryConfig(root);
    writeSources(root, [{
      slug: 'anthropics-skills',
      type: 'git_repository_collection',
      url: repo,
      include: ['skills/*/SKILL.md'],
      trackingRef: 'main'
    }]);

    const entries = await importSourceEntries('anthropics-skills', root);
    expect(entries.map((entry) => entry.slug).sort()).toEqual(['anthropics-skills-docx', 'anthropics-skills-pdf']);
    expect(entries.every((entry) => entry.source.type === 'git_repository')).toBe(true);
    expect(entries.map((entry) => entry.source.path).sort()).toEqual(['skills/docx/SKILL.md', 'skills/pdf/SKILL.md']);

    const pdf = await readEntryCatalog(root, 'anthropics-skills-pdf');
    const docx = await readEntryCatalog(root, 'anthropics-skills-docx');
    expect(pdf.displayName).toBe('PDF Skill');
    expect(docx.displayName).toBe('DOCX Skill');
    expect(pdf.url).toContain('/skills/pdf/SKILL.md');
    expect(JSON.stringify([pdf, docx])).not.toContain('metadata.agentcaps');

    await expect(importSource('anthropics-skills', root)).rejects.toThrow('Use importSourceEntries');
  });
});
