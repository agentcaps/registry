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

  const queryCount = entry.representativeQueries?.length ?? 0;
  if (queryCount >= 2 && queryCount <= 5) score += 20;
  else if (queryCount === 1) {
    score += 8;
    warnings.push(finding('representative-queries', 'Provide 2-5 representative queries for better ARD search quality.', 'warning'));
  } else {
    warnings.push(finding('representative-queries', 'Missing representative queries.', 'warning'));
  }

  const descriptionLength = entry.description?.trim().length ?? 0;
  if (descriptionLength >= 40) score += 15;
  else if (descriptionLength >= 15) {
    score += 8;
    warnings.push(finding('description-quality', 'Description is present but should be more specific.', 'warning'));
  } else {
    warnings.push(finding('description-quality', 'Missing or weak description.', 'warning'));
  }

  if ((entry.capabilities?.length ?? 0) > 0) score += 8;
  else warnings.push(finding('capabilities', 'Missing capability labels.', 'warning'));

  if ((entry.tags?.length ?? 0) > 0) score += 7;
  else warnings.push(finding('tags', 'Missing tags.', 'warning'));

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
