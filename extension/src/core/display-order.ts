import type { ImageDisplayRecord } from './display-records.js';

export type RecentDisplayOrder = 'newest-first' | 'oldest-first';
export type QueueDisplayOrder = 'front-first' | 'back-first';

export const DEFAULT_RECENT_DISPLAY_ORDER: RecentDisplayOrder = 'newest-first';
export const DEFAULT_QUEUE_DISPLAY_ORDER: QueueDisplayOrder = 'front-first';

export function isRecentDisplayOrder(value: unknown): value is RecentDisplayOrder {
  return value === 'newest-first' || value === 'oldest-first';
}

export function isQueueDisplayOrder(value: unknown): value is QueueDisplayOrder {
  return value === 'front-first' || value === 'back-first';
}

export function queueTimeForRecord(record: ImageDisplayRecord): string {
  return record.queueUpdatedAt ?? record.timestamp;
}

export function sortRecentRecords(records: readonly ImageDisplayRecord[], order: RecentDisplayOrder): readonly ImageDisplayRecord[] {
  return stableSortByTimestamp(records, (record) => record.timestamp, order === 'newest-first');
}

export function sortQueueRecords(records: readonly ImageDisplayRecord[], order: QueueDisplayOrder): readonly ImageDisplayRecord[] {
  return stableSortByTimestamp(records, queueTimeForRecord, order === 'front-first');
}

function stableSortByTimestamp(
  records: readonly ImageDisplayRecord[],
  getTimestamp: (record: ImageDisplayRecord) => string,
  descending: boolean,
): readonly ImageDisplayRecord[] {
  return records
    .map((record, index) => ({ record, index, timestamp: parseTimestamp(getTimestamp(record)) }))
    .sort((left, right) => compareTimestampEntries(left, right, descending))
    .map(({ record }) => record);
}

function compareTimestampEntries(
  left: { readonly index: number; readonly timestamp: number | null },
  right: { readonly index: number; readonly timestamp: number | null },
  descending: boolean,
): number {
  if (left.timestamp === null && right.timestamp === null) return left.index - right.index;
  if (left.timestamp === null) return 1;
  if (right.timestamp === null) return -1;
  if (left.timestamp === right.timestamp) return left.index - right.index;
  return descending ? right.timestamp - left.timestamp : left.timestamp - right.timestamp;
}

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
