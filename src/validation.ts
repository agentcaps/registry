import { ACCEPTED_SKILL_MEDIA_TYPES } from './constants.js';
import type { CatalogEntry, ValidationFinding, ValidationReport } from './types.js';

function finding(code: string, message: string, severity: ValidationFinding['severity']): ValidationFinding {
  return { code, message, severity };
}

function isPinnedUrl(url?: string): boolean {
  if (!url) return false;
  if (url.startsWith('file://')) return true;
  return /\/[a-f0-9]{7,40}\//i.test(url);
}

function hasValidIdentifier(identifier?: string): boolean {
  return Boolean(identifier?.match(/^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/));
}

// Capability labels are namespaced verbs like `web.fetch` or `slides.create`:
// lower-case segments joined by dots, with at least one dot.
const CAPABILITY_LABEL = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*)+$/;

// A description is "generic" when it opens with a filler noun and stays short,
// e.g. "A skill that helps." It carries little ARD search signal.
const GENERIC_DESCRIPTION = /^(?:a|an|the)?\s*(?:skill|tool|capability|agent|plugin|helper)\b/i;

const MIN_QUERY_LENGTH = 12;

export function validateCatalogEntry(entry: CatalogEntry): ValidationReport {
  const errors: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];
  const info: ValidationFinding[] = [];
  let score = 0;

  const requiredPresent = [entry.identifier, entry.displayName, entry.type, entry.url || entry.data].filter(Boolean).length;
  score += (requiredPresent / 4) * 30;
  if (requiredPresent < 4) errors.push(finding('required-fields', 'Missing one or more required CatalogEntry fields.', 'error'));

  if (!ACCEPTED_SKILL_MEDIA_TYPES.includes(entry.type as (typeof ACCEPTED_SKILL_MEDIA_TYPES)[number])) {
    errors.push(finding('media-type', `Unsupported skill media type: ${entry.type}`, 'error'));
  }

  // Representative queries: count, then duplicate and length quality.
  const queries = entry.representativeQueries ?? [];
  const queryCount = queries.length;
  if (queryCount >= 2 && queryCount <= 5) {
    score += 20;
  } else if (queryCount === 1) {
    score += 8;
    warnings.push(finding('representative-queries', 'Provide 2-5 representative queries for better ARD search quality.', 'warning'));
  } else if (queryCount > 5) {
    score += 15;
    warnings.push(finding('representative-queries', 'More than 5 representative queries; trim to the 2-5 most representative.', 'warning'));
  } else {
    warnings.push(finding('representative-queries', 'Missing representative queries.', 'warning'));
  }
  if (queryCount > 0) {
    const normalizedQueries = queries.map((q) => q.trim().toLowerCase());
    const duplicateQueries = [...new Set(normalizedQueries.filter((q, i) => normalizedQueries.indexOf(q) !== i))];
    if (duplicateQueries.length) {
      score -= 4;
      warnings.push(finding('representative-queries-duplicate', `Representative queries contain duplicates: ${duplicateQueries.join(', ')}.`, 'warning'));
    }
    const tooShort = queries.filter((q) => q.trim().length < MIN_QUERY_LENGTH);
    if (tooShort.length) {
      score -= Math.min(6, tooShort.length * 2);
      warnings.push(finding('representative-queries-quality', 'Some representative queries are too short to be useful search examples; use natural-language phrases.', 'warning'));
    }
  }

  // Description: length tiers, then generic-phrasing check.
  const description = entry.description?.trim() ?? '';
  const descriptionLength = description.length;
  if (descriptionLength >= 40) score += 15;
  else if (descriptionLength >= 15) {
    score += 8;
    warnings.push(finding('description-quality', 'Description is present but should be more specific.', 'warning'));
  } else {
    warnings.push(finding('description-quality', 'Missing or weak description.', 'warning'));
  }
  if (descriptionLength > 0 && descriptionLength < 80 && GENERIC_DESCRIPTION.test(description)) {
    score -= 3;
    warnings.push(finding('description-generic', 'Description looks generic; state concretely what the capability does and when to use it.', 'warning'));
  }

  // Capabilities: presence, then label format.
  const capabilities = entry.capabilities ?? [];
  if (capabilities.length > 0) {
    score += 8;
    const malformed = capabilities.filter((label) => !CAPABILITY_LABEL.test(label));
    if (malformed.length) {
      score -= Math.min(6, malformed.length * 2);
      warnings.push(finding('capability-format', `Capability labels should be namespaced like "domain.action": ${malformed.join(', ')}.`, 'warning'));
    }
  } else {
    warnings.push(finding('capabilities', 'Missing capability labels.', 'warning'));
  }

  // Tags: presence, then duplicate and normalization checks.
  const tags = entry.tags ?? [];
  if (tags.length > 0) {
    score += 7;
    const normalizedTags = tags.map((tag) => tag.trim().toLowerCase());
    const duplicateTags = [...new Set(normalizedTags.filter((tag, i) => normalizedTags.indexOf(tag) !== i))];
    if (duplicateTags.length) {
      score -= 3;
      warnings.push(finding('tags-duplicate', `Tags contain duplicates after normalization: ${duplicateTags.join(', ')}.`, 'warning'));
    }
    const unnormalized = tags.filter((tag) => tag !== tag.trim().toLowerCase());
    if (unnormalized.length) {
      score -= 2;
      warnings.push(finding('tags-normalize', `Tags should be lower-case and trimmed: ${unnormalized.join(', ')}.`, 'warning'));
    }
  } else {
    warnings.push(finding('tags', 'Missing tags.', 'warning'));
  }

  if (isPinnedUrl(entry.url)) score += 10;
  else warnings.push(finding('pinned-url', 'CatalogEntry.url should point to a pinned artifact URL.', 'warning'));

  if (hasValidIdentifier(entry.identifier)) score += 5;
  else errors.push(finding('identifier', 'Identifier must be a valid urn:air value.', 'error'));

  if (entry.trustManifest) info.push(finding('trust-manifest', 'TrustManifest supplied.', 'info'));
  else info.push(finding('trust-manifest', 'TrustManifest not supplied; this is informational and not a safety score.', 'info'));

  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: rounded,
    errors,
    warnings,
    info,
    summary: `Validation score measures ARD metadata completeness, not safety, trust, or publisher verification. Score: ${rounded}/100.`
  };
}

export interface UrlReachabilityOptions {
  timeoutMs?: number;
}

/**
 * Network-dependent reachability check for a CatalogEntry URL. Kept out of the
 * deterministic {@link validateCatalogEntry} score so offline/CI runs stay stable;
 * callers opt in (CLI `validate --check-urls`). Returns an `info` finding when the
 * artifact resolves and a `warning` finding otherwise.
 */
export async function checkUrlReachability(url?: string, options: UrlReachabilityOptions = {}): Promise<ValidationFinding> {
  if (!url) return finding('url-reachability', 'No CatalogEntry.url to check.', 'warning');

  if (url.startsWith('file://') || !/^https?:\/\//.test(url)) {
    const { existsSync } = await import('node:fs');
    let path = url;
    if (url.startsWith('file://')) {
      const { fileURLToPath } = await import('node:url');
      try {
        path = fileURLToPath(url);
      } catch {
        return finding('url-reachability', `Could not resolve file URL: ${url}`, 'warning');
      }
    }
    return existsSync(path)
      ? finding('url-reachability', 'CatalogEntry.url artifact is present on disk.', 'info')
      : finding('url-reachability', `CatalogEntry.url artifact not found: ${url}`, 'warning');
  }

  const timeoutMs = options.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    }
    return response.ok
      ? finding('url-reachability', `CatalogEntry.url is reachable (HTTP ${response.status}).`, 'info')
      : finding('url-reachability', `CatalogEntry.url returned HTTP ${response.status}.`, 'warning');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return finding('url-reachability', `CatalogEntry.url is not reachable: ${message}`, 'warning');
  } finally {
    clearTimeout(timer);
  }
}

/** {@link validateCatalogEntry} plus an appended URL reachability finding. */
export async function validateCatalogEntryWithReachability(
  entry: CatalogEntry,
  options: UrlReachabilityOptions = {}
): Promise<ValidationReport> {
  const report = validateCatalogEntry(entry);
  const reachability = await checkUrlReachability(entry.url, options);
  (reachability.severity === 'info' ? report.info : report.warnings).push(reachability);
  return report;
}
