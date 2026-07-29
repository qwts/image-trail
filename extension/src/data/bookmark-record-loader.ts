import type { ImageDisplayRecord } from '../core/display-records.js';
import { toDisplayRecord } from './bookmark-record-mappers.js';
import type { BookmarksRepository } from './repositories/bookmarks-repository.js';

export interface MergedBookmarkRecordsCache {
  readonly keyReference: string | null;
  readonly records: readonly ImageDisplayRecord[];
}

export async function loadPlainBookmarkRecords(repository: BookmarksRepository, key: CryptoKey): Promise<readonly ImageDisplayRecord[]> {
  const loaded: ImageDisplayRecord[] = [];
  for (const record of await repository.listEncryptedNewestFirst()) {
    try {
      const payload = await repository.openRecord(record, key);
      loaded.push(toDisplayRecord(record.uuid, payload, record.queueUpdatedAt));
    } catch {
      // Bookmarks encrypted with unavailable legacy keys stay durable but hidden.
    }
  }
  return loaded;
}
