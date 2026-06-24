import YAML from 'yaml';
import type { SkillDocument } from './types.js';

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function extractHeading(body: string): string | undefined {
  const line = body.split('\n').find((candidate) => candidate.startsWith('# '));
  return line?.replace(/^#\s+/, '').trim();
}

function extractFirstParagraph(body: string): string | undefined {
  const paragraph = body
    .replace(/^# .+$/m, '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find(Boolean);
  return paragraph;
}

export function parseSkillMarkdown(markdown: string): SkillDocument {
  let frontmatter: Record<string, unknown> = {};
  let body = markdown;
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (match) {
    frontmatter = (YAML.parse(match[1]) ?? {}) as Record<string, unknown>;
    body = markdown.slice(match[0].length);
  }

  const name = firstString(frontmatter.name, frontmatter.title, extractHeading(body)) ?? 'Untitled Skill';
  const description = firstString(
    frontmatter.description,
    frontmatter.summary,
    extractFirstParagraph(body)
  );
  const representativeQueries = [
    ...toStringArray(frontmatter.representativeQueries),
    ...toStringArray(frontmatter.representative_queries)
  ];

  return {
    name,
    description,
    tags: toStringArray(frontmatter.tags),
    capabilities: toStringArray(frontmatter.capabilities),
    representativeQueries,
    version: firstString(frontmatter.version),
    frontmatter,
    body
  };
}
