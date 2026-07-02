import * as v from 'valibot';
import type { UrlReviewStatusRecord } from '../../core/types.js';
import { urlReviewStatusRecordSchema } from '../../core/types.schema.js';
import type { RecoverableDataStatus } from '../types.js';
import { firstIssueReason } from './schema-issues.js';
import { createImportValidationReport, type ImportValidationReport } from './validation-report.js';

export const URL_REVIEW_STATUS_EXPORT_FORMAT = 'image-trail.url-review-status';
export const URL_REVIEW_STATUS_EXPORT_VERSION = 1;

const urlReviewStatusExportEnvelopeSchema = v.object({
  format: v.literal(URL_REVIEW_STATUS_EXPORT_FORMAT),
  formatVersion: v.literal(URL_REVIEW_STATUS_EXPORT_VERSION),
  // createdAt/recordCount are unused metadata; keep them optional so a file that omits
  // them still imports, matching the former envelope check (format + version + records).
  createdAt: v.optional(v.string()),
  recordCount: v.optional(v.number()),
  records: v.pipe(v.array(v.unknown()), v.readonly()),
});

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
  readonly validationReport: ImportValidationReport;
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
    validationReport: createImportValidationReport([]),
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    return fail('Invalid URL review status export JSON.');
  }

  const envelopeResult = v.safeParse(urlReviewStatusExportEnvelopeSchema, parsed);
  if (!envelopeResult.success) {
    return fail('Invalid URL review status export format.');
  }
  const envelope = envelopeResult.output;

  const records: UrlReviewStatusRecord[] = [];
  const skipped: string[] = [];
  const rejectionReasons: string[] = [];
  for (const item of envelope.records) {
    const rejectionReason = urlReviewStatusRejectionReason(item);
    if (!rejectionReason) {
      records.push(item as UrlReviewStatusRecord);
    } else {
      skipped.push('redacted');
      rejectionReasons.push(rejectionReason);
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
    validationReport: createImportValidationReport(rejectionReasons),
  };
}

function urlReviewStatusRejectionReason(value: unknown): string | null {
  const result = v.safeParse(urlReviewStatusRecordSchema, value);
  return result.success ? null : firstIssueReason(result.issues, 'Invalid URL review status entry');
}
