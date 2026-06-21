import type { ImageDisplayRecord } from '../core/display-records.js';
import { createDisplayRecord } from '../core/display-records.js';
import type { BookmarkStore } from '../core/types.js';
import { createKeyReference } from './crypto/key-reference.js';
import type { KeyReference, StoredKeyRecord } from './crypto/types.js';
import { generateAesGcmKey } from './crypto/webcrypto.js';
import { openImageTrailDb } from './db.js';
import { DEFAULT_LOCAL_SETTINGS } from './local-settings.js';
import { BookmarksRepository } from './repositories/bookmarks-repository.js';
import { KeysRepository } from './repositories/keys-repository.js';
import type { DurableBookmarkPayloadV1 } from './types.js';

interface DurableBookmarkKeyRecord extends StoredKeyRecord<'bookmark'> {
  readonly key: CryptoKey;
}

interface BookmarkKeyContext {
  readonly reference: KeyReference<'bookmark'>;
  readonly key: CryptoKey;
}

export interface BookmarkPage {
  readonly items: readonly ImageDisplayRecord[];
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
  readonly hasOlder: boolean;
  readonly hasNewer: boolean;
}

export interface BookmarkRecallPage {
  readonly items: readonly ImageDisplayRecord[];
  readonly offset: number;
  readonly limit: number;
  readonly nextOffset: number;
  readonly hasMore: boolean;
  readonly total: number;
  readonly failedCount: number;
}

export class IndexedDbBookmarkStore implements BookmarkStore {
  private ready: Promise<{
    readonly db: IDBDatabase;
    readonly repository: BookmarksRepository;
    readonly bookmarkKey: BookmarkKeyContext;
  } | null> | null = null;

  async load(): Promise<readonly ImageDisplayRecord[]> {
    return (await this.loadPage({ offset: 0, limit: DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax })).items;
  }

  async loadPage(input: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site';
    readonly currentPageUrl?: string;
  }): Promise<BookmarkPage> {
    const context = await this.openContext();
    const offset = Math.max(0, input.offset);
    const limit = Math.max(1, input.limit);
    if (!context) return { items: [], offset, limit, total: 0, hasOlder: false, hasNewer: false };

    const records = await context.repository.listEncryptedNewestFirst();
    const loaded: ImageDisplayRecord[] = [];
    for (const record of records) {
      try {
        const payload = await context.repository.openRecord(record, context.bookmarkKey.key);
        if (payload) loaded.push(toDisplayRecord(record.uuid, payload));
      } catch {
        // Bookmarks encrypted with unavailable legacy keys stay durable but hidden.
      }
    }
    const visible = filterByVisibilityScope(loaded, input.scope ?? 'global', input.currentPageUrl);
    const total = visible.length;
    const clampedOffset = clampPageOffset(offset, limit, total);
    const items = visible.slice(clampedOffset, clampedOffset + limit);
    return {
      items,
      offset: clampedOffset,
      limit,
      total,
      hasOlder: clampedOffset + limit < total,
      hasNewer: clampedOffset > 0,
    };
  }

  async save(record: ImageDisplayRecord): Promise<ImageDisplayRecord> {
    const context = await this.openContext();
    const importedDataUrl = record.url.startsWith('data:image/');
    const bookmark = createDisplayRecord({ ...record, id: importedDataUrl ? record.id : record.url, source: 'bookmark' });
    if (!context) return bookmark;

    const indexUrl = importedDataUrl ? `image-trail-import:${bookmark.id}` : bookmark.url;
    const existing = importedDataUrl
      ? await context.repository.getEncrypted(bookmark.id)
      : await context.repository.getEncryptedByUrl(bookmark.url);
    const uuid = existing?.uuid ?? crypto.randomUUID();
    await context.repository.sealAndPut(
      uuid,
      toPayload(bookmark),
      context.bookmarkKey.key,
      context.bookmarkKey.reference,
      existing?.envelope.updatedAt,
      indexUrl,
      existing?.queueUpdatedAt ?? bookmark.timestamp,
    );
    return { ...bookmark, id: uuid };
  }

  async loadRecallPage(input: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site';
    readonly currentPageUrl?: string;
  }): Promise<BookmarkRecallPage> {
    const context = await this.openContext();
    const offset = Math.max(0, input.offset);
    const limit = Math.max(1, input.limit);
    if (!context) return { items: [], offset, limit, nextOffset: offset, hasMore: false, total: 0, failedCount: 0 };

    if ((input.scope ?? 'global') === 'site') {
      return this.loadRecallPageByScanning(context, input, offset, limit);
    }

    const items: ImageDisplayRecord[] = [];
    let failedCount = 0;
    let pageOffset = offset;
    let hasMore = false;
    const chunkLimit = limit + 1;
    while (items.length <= limit) {
      const records = await context.repository.listEncryptedPage({ offset: pageOffset, limit: chunkLimit });
      if (records.length === 0) break;
      pageOffset += records.length;
      for (const record of records) {
        try {
          const payload = await context.repository.openRecord(record, context.bookmarkKey.key);
          if (payload) items.push(toDisplayRecord(record.uuid, payload));
        } catch {
          failedCount += 1;
        }
      }
      if (records.length < chunkLimit) break;
    }
    if (items.length > limit) {
      hasMore = true;
      items.length = limit;
    }
    const total = await context.repository.countEncrypted();
    return { items, offset, limit, nextOffset: offset + items.length, hasMore, total: Math.max(0, total - offset), failedCount };
  }

  async moveToFront(ids: readonly string[]): Promise<readonly ImageDisplayRecord[]> {
    const context = await this.openContext();
    if (!context) return [];
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    const baseTime = Date.now();
    const updated = await context.repository.updateQueueUpdatedAt(
      // Queue pages read queueUpdatedAt newest-first, so earlier selected IDs get later timestamps.
      uniqueIds.map((uuid, index) => ({ uuid, queueUpdatedAt: new Date(baseTime + uniqueIds.length - index).toISOString() })),
    );
    const records: ImageDisplayRecord[] = [];
    for (const record of updated) {
      try {
        const payload = await context.repository.openRecord(record, context.bookmarkKey.key);
        records.push(toDisplayRecord(record.uuid, payload));
      } catch {
        // If a record cannot be decrypted, it was not successfully recalled.
      }
    }
    return records;
  }

  async remove(record: ImageDisplayRecord): Promise<void> {
    const context = await this.openContext();
    if (!context) return;
    const existing = (await context.repository.getEncrypted(record.id)) ?? (await context.repository.getEncryptedByUrl(record.url));
    if (existing) await context.repository.remove(existing.uuid);
  }

  async close(): Promise<void> {
    const context = await this.ready;
    context?.db.close();
    this.ready = null;
  }

  private openContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: BookmarksRepository;
    readonly bookmarkKey: BookmarkKeyContext;
  } | null> {
    this.ready ??= this.createContext();
    return this.ready;
  }

  private async createContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: BookmarksRepository;
    readonly bookmarkKey: BookmarkKeyContext;
  } | null> {
    const result = await openImageTrailDb();
    if (!result.db) return null;
    const bookmarkKey = await ensureDurableBookmarkKey(new KeysRepository(result.db));
    return { db: result.db, repository: new BookmarksRepository(result.db), bookmarkKey };
  }

  private async loadRecallPageByScanning(
    context: {
      readonly repository: BookmarksRepository;
      readonly bookmarkKey: BookmarkKeyContext;
    },
    input: {
      readonly scope?: 'global' | 'site';
      readonly currentPageUrl?: string;
    },
    offset: number,
    limit: number,
  ): Promise<BookmarkRecallPage> {
    const items: ImageDisplayRecord[] = [];
    let failedCount = 0;
    let scannedOffset = 0;
    let matchingSkipped = 0;
    let hasMore = false;
    const chunkLimit = Math.max(limit * 4, DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax, 30);

    while (items.length <= limit) {
      const records = await context.repository.listEncryptedPage({ offset: scannedOffset, limit: chunkLimit });
      if (records.length === 0) break;
      scannedOffset += records.length;

      for (const record of records) {
        try {
          const payload = await context.repository.openRecord(record, context.bookmarkKey.key);
          const displayRecord = payload ? toDisplayRecord(record.uuid, payload) : null;
          if (!displayRecord || !isVisibleInScope(displayRecord, input.scope ?? 'global', input.currentPageUrl)) continue;
          if (matchingSkipped < offset) {
            matchingSkipped += 1;
            continue;
          }
          if (items.length >= limit) {
            hasMore = true;
            break;
          }
          items.push(displayRecord);
        } catch {
          failedCount += 1;
        }
      }
      if (hasMore || records.length < chunkLimit) break;
    }

    return {
      items,
      offset,
      limit,
      nextOffset: offset + items.length,
      hasMore,
      total: offset + items.length + (hasMore ? 1 : 0),
      failedCount,
    };
  }
}

function filterByVisibilityScope(
  records: readonly ImageDisplayRecord[],
  scope: 'global' | 'site',
  currentPageUrl: string | undefined,
): readonly ImageDisplayRecord[] {
  return records.filter((record) => isVisibleInScope(record, scope, currentPageUrl));
}

function isVisibleInScope(record: ImageDisplayRecord, scope: 'global' | 'site', currentPageUrl: string | undefined): boolean {
  if (scope !== 'site' || !currentPageUrl) return true;
  const currentHostname = hostnameFromUrl(currentPageUrl);
  if (!currentHostname) return true;
  return hostnameFromUrl(record.url) === currentHostname;
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function ensureDurableBookmarkKey(repository: KeysRepository): Promise<BookmarkKeyContext> {
  const existing = (await repository.listByKind('bookmark')).find(isDurableBookmarkKeyRecord);
  if (existing) return { reference: existing, key: existing.key };

  const uuid = crypto.randomUUID();
  const reference = createKeyReference('bookmark', uuid);
  const now = new Date().toISOString();
  const record: DurableBookmarkKeyRecord = {
    ...reference,
    key: await generateAesGcmKey(false),
    createdAt: now,
    updatedAt: now,
    wrapping: { mode: 'indexeddb', algorithm: 'none' },
    extractable: false,
  };
  await repository.put(record);
  return { reference, key: record.key };
}

function isDurableBookmarkKeyRecord(record: StoredKeyRecord): record is DurableBookmarkKeyRecord {
  return typeof CryptoKey !== 'undefined' && record.kind === 'bookmark' && record.key instanceof CryptoKey;
}

function clampPageOffset(offset: number, limit: number, total: number): number {
  if (total <= 0) return 0;
  const lastPageOffset = Math.floor((total - 1) / limit) * limit;
  return Math.min(offset, lastPageOffset);
}

function toPayload(record: ImageDisplayRecord): DurableBookmarkPayloadV1 {
  return {
    url: record.url,
    title: record.title,
    label: record.label,
    thumbnail: record.thumbnail,
    bookmarkedAt: record.timestamp,
    downloadedAt: record.downloadedAt,
    capturedAt: record.capturedAt,
    sourceCompatibility: 'favorites',
    storedOriginal: record.storedOriginal,
  };
}

function toDisplayRecord(id: string, payload: DurableBookmarkPayloadV1): ImageDisplayRecord {
  const storedOriginal = payload.storedOriginal;
  return createDisplayRecord({
    id,
    url: payload.url,
    title: payload.title,
    label: payload.label,
    thumbnail: payload.thumbnail,
    timestamp: payload.bookmarkedAt,
    downloadedAt: payload.downloadedAt,
    capturedAt: payload.capturedAt ?? storedOriginal?.capturedAt,
    captureStatus: storedOriginal ? 'captured' : undefined,
    blobId: storedOriginal?.blobId,
    storedOriginal,
    source: payload.sourceCompatibility ?? 'bookmark',
  });
}
