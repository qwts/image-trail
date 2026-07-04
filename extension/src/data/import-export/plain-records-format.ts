import * as v from 'valibot';
import type { DurableBookmarkPayloadV1, DurableHistoryPayloadV1 } from '../types.js';

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

const plainRecordsExportEnvelopeSchema = v.object({
  format: v.literal(PLAIN_RECORDS_FORMAT),
  formatVersion: v.literal(PLAIN_RECORDS_FORMAT_VERSION),
  payloadType: v.picklist(['history', 'bookmarks']),
  createdAt: v.string(),
  recordCount: v.number(),
  entries: v.pipe(v.array(v.unknown()), v.readonly()),
}) as v.GenericSchema<unknown, PlainRecordsExportEnvelope<unknown>>;

/**
 * Validates the envelope structure only; individual `entries` stay `unknown` and
 * are shape-checked per item by the history/bookmark entry parsers downstream,
 * which skip and report malformed rows rather than failing the whole import.
 */
export function parsePlainRecordsExport(raw: string): PlainRecordsExportEnvelope<unknown> {
  const parsed: unknown = JSON.parse(raw);
  const result = v.safeParse(plainRecordsExportEnvelopeSchema, parsed);
  if (!result.success) {
    throw new Error('Invalid plain Image Trail export.');
  }
  return result.output;
}
