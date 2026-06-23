import type { UrlReviewStatusRecord } from '../../core/types.js';
import type { RecoverableDataStatus } from '../types.js';

export const URL_REVIEW_STATUS_EXPORT_FORMAT = 'image-trail.url-review-status';
export const URL_REVIEW_STATUS_EXPORT_VERSION = 1;

export interface UrlReviewStatusExportEnvelope {
  readonly format: typeof URL_REVIEW_STATUS_EXPORT_FORMAT;
  readonly formatVersion: typeof URL_REVIEW_STATUS_EXPORT_VERSION;
  readonly createdAt: string;
  readonly recordCount: number;
  readonly records: readonly UrlReviewStatusRecord[];
}

export interface UrlReviewStatusExportResult {
  readonly status: RecoverableDataStatus;
  readonly fileContent?: string;
  readonly fileName?: string;
}

export interface UrlReviewStatusImportResult {
  readonly status: RecoverableDataStatus;
  readonly records: readonly UrlReviewStatusRecord[];
  readonly skipped: readonly string[];
}

export function exportUrlReviewStatus(input: {
  readonly records: readonly UrlReviewStatusRecord[];
  readonly now?: string;
}): UrlReviewStatusExportResult {
  const { records, now = new Date().toISOString() } = input;
  if (records.length === 0) {
    return { status: { ok: false, code: 'not-found', message: 'No URL review status records to export.' } };
  }
  const envelope: UrlReviewStatusExportEnvelope = {
    format: URL_REVIEW_STATUS_EXPORT_FORMAT,
    formatVersion: URL_REVIEW_STATUS_EXPORT_VERSION,
    createdAt: now,
    recordCount: records.length,
    records,
  };
  return {
    status: { ok: true, code: 'ok', message: `Exported ${records.length} URL review status record(s).` },
    fileContent: JSON.stringify(envelope, null, 2),
    fileName: `image-trail-url-review-status-${now.slice(0, 10)}.json`,
  };
}

export function importUrlReviewStatus(fileContent: string): UrlReviewStatusImportResult {
  const fail = (message: string): UrlReviewStatusImportResult => ({
    status: { ok: false, code: 'decryption-failed', message },
    records: [],
    skipped: [],
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    return fail('Invalid URL review status export JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) return fail('URL review status export must be a JSON object.');
  const envelope = parsed as Record<string, unknown>;
  if (
    envelope.format !== URL_REVIEW_STATUS_EXPORT_FORMAT ||
    envelope.formatVersion !== URL_REVIEW_STATUS_EXPORT_VERSION ||
    !Array.isArray(envelope.records)
  ) {
    return fail('Invalid URL review status export format.');
  }

  const records: UrlReviewStatusRecord[] = [];
  const skipped: string[] = [];
  for (const item of envelope.records) {
    if (isValidUrlReviewStatusRecord(item)) {
      records.push(item);
    } else {
      skipped.push(typeof item === 'object' && item !== null && 'sourceUrl' in item ? String(item.sourceUrl) : 'unknown');
    }
  }

  return {
    status: {
      ok: true,
      code: 'ok',
      message: `Imported ${records.length} URL review status record(s)${skipped.length ? `, skipped ${skipped.length}` : ''}.`,
    },
    records,
    skipped,
  };
}

function isValidUrlReviewStatusRecord(value: unknown): value is UrlReviewStatusRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    typeof record.hostname === 'string' &&
    typeof record.pageUrl === 'string' &&
    typeof record.sourceUrl === 'string' &&
    (record.status === 'passed' || record.status === 'failed' || record.status === 'unchanged') &&
    Array.isArray(record.fieldIds) &&
    record.fieldIds.every((fieldId) => typeof fieldId === 'string') &&
    (typeof record.activeFieldId === 'string' || record.activeFieldId === null) &&
    (typeof record.reason === 'string' || record.reason === undefined) &&
    typeof record.updatedAt === 'string'
  );
}
