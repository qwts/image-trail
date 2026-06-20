import type { DurableBookmarkPayloadV1, DurableHistoryPayloadV1, RecoverableDataStatus } from '../types.js';

export const PLAIN_RECORDS_FORMAT = 'image-trail.records';
export const PLAIN_RECORDS_FORMAT_VERSION = 1;

export type PlainRecordsPayloadType = 'history' | 'bookmarks';
export type PlainHistoryExportEntry = { readonly uuid: string; readonly payload: DurableHistoryPayloadV1 };
export type PlainBookmarkExportEntry = { readonly uuid: string; readonly payload: DurableBookmarkPayloadV1 };

export interface PlainRecordsExportEnvelope<TEntry = PlainHistoryExportEntry | PlainBookmarkExportEntry> {
  readonly format: typeof PLAIN_RECORDS_FORMAT;
  readonly formatVersion: typeof PLAIN_RECORDS_FORMAT_VERSION;
  readonly payloadType: PlainRecordsPayloadType;
  readonly createdAt: string;
  readonly recordCount: number;
  readonly entries: readonly TEntry[];
}

export interface PlainRecordsImportResult<TEntry> {
  readonly status: RecoverableDataStatus;
  readonly entries: readonly TEntry[];
  readonly skipped: readonly string[];
}

export function serializePlainRecordsExport<TEntry>(input: {
  readonly payloadType: PlainRecordsPayloadType;
  readonly entries: readonly TEntry[];
  readonly now?: string;
}): string {
  const envelope: PlainRecordsExportEnvelope<TEntry> = {
    format: PLAIN_RECORDS_FORMAT,
    formatVersion: PLAIN_RECORDS_FORMAT_VERSION,
    payloadType: input.payloadType,
    createdAt: input.now ?? new Date().toISOString(),
    recordCount: input.entries.length,
    entries: input.entries,
  };
  return JSON.stringify(envelope, null, 2);
}

export function parsePlainRecordsExport(raw: string): PlainRecordsExportEnvelope {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Plain export must be a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  if (
    obj.format !== PLAIN_RECORDS_FORMAT ||
    obj.formatVersion !== PLAIN_RECORDS_FORMAT_VERSION ||
    (obj.payloadType !== 'history' && obj.payloadType !== 'bookmarks') ||
    typeof obj.createdAt !== 'string' ||
    typeof obj.recordCount !== 'number' ||
    !Array.isArray(obj.entries)
  ) {
    throw new Error('Invalid plain Image Trail export.');
  }
  return obj as unknown as PlainRecordsExportEnvelope;
}
