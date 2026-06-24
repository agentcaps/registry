import type { CatalogEntry, SearchDocument, SearchIndexData, SearchResult } from './types.js';

const FIELD_WEIGHTS: Record<string, number> = {
  representativeQueries: 4,
  displayName: 3,
  capabilities: 3,
  tags: 2,
  description: 1.5,
  source: 1
};

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return [];
}

export function documentFromEntry(slug: string, catalogEntry: CatalogEntry, source: { url: string; path?: string }): SearchDocument {
  return {
    slug,
    catalogEntry,
    fields: {
      representativeQueries: asArray(catalogEntry.representativeQueries),
      displayName: asArray(catalogEntry.displayName),
      capabilities: asArray(catalogEntry.capabilities),
      tags: asArray(catalogEntry.tags),
      description: asArray(catalogEntry.description),
      source: [source.url, source.path ?? '']
    },
    source
  };
}

function weightedTokens(doc: SearchDocument): string[] {
  const tokens: string[] = [];
  for (const [field, values] of Object.entries(doc.fields)) {
    const weight = FIELD_WEIGHTS[field] ?? 1;
    const repeat = Math.max(1, Math.round(weight));
    for (const value of values) {
      const valueTokens = tokenize(value);
      for (let i = 0; i < repeat; i += 1) tokens.push(...valueTokens);
    }
  }
  return tokens;
}

export function buildSearchIndex(documents: SearchDocument[]): SearchIndexData {
  const documentFrequencies: Record<string, number> = {};
  let totalLength = 0;
  for (const doc of documents) {
    const uniqueTerms = new Set(weightedTokens(doc));
    totalLength += weightedTokens(doc).length;
    for (const term of uniqueTerms) documentFrequencies[term] = (documentFrequencies[term] ?? 0) + 1;
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    documents,
    averageDocumentLength: documents.length ? totalLength / documents.length : 0,
    documentCount: documents.length,
    documentFrequencies
  };
}

export function searchIndex(index: SearchIndexData, query: string, limit = 10): SearchResult[] {
  const queryTerms = tokenize(query);
  const k1 = 1.2;
  const b = 0.75;
  const results: SearchResult[] = [];

  for (const doc of index.documents) {
    const tokens = weightedTokens(doc);
    const length = tokens.length || 1;
    const termCounts = new Map<string, number>();
    for (const token of tokens) termCounts.set(token, (termCounts.get(token) ?? 0) + 1);

    let score = 0;
    const reasons = new Set<string>();
    for (const term of queryTerms) {
      const tf = termCounts.get(term) ?? 0;
      if (!tf) continue;
      const df = index.documentFrequencies[term] ?? 0;
      const idf = Math.log(1 + (index.documentCount - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (length / (index.averageDocumentLength || length)))));
      for (const [field, values] of Object.entries(doc.fields)) {
        if (values.some((value) => tokenize(value).includes(term))) reasons.add(`${field}:${term}`);
      }
    }

    if (score > 0) {
      results.push({
        slug: doc.slug,
        score: Math.round(score * 1000) / 1000,
        catalogEntry: doc.catalogEntry,
        matchReasons: [...reasons].slice(0, 6),
        source: doc.source
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
