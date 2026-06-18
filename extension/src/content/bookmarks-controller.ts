import type { ImageDisplayRecord } from '../core/display-records.js';
import { createDisplayRecord } from '../core/display-records.js';
import { createSessionKey, type SessionKeyRecord } from '../data/crypto/keyring.js';
import { openImageTrailDb } from '../data/db.js';
import { BookmarksRepository } from '../data/repositories/bookmarks-repository.js';
import { KeysRepository } from '../data/repositories/keys-repository.js';
import type { DurableBookmarkPayloadV1 } from '../data/types.js';
import type { BookmarkStore } from '../core/types.js';

export class IndexedDbBookmarkStore implements BookmarkStore {
  private ready: Promise<{
    readonly db: IDBDatabase;
    readonly repository: BookmarksRepository;
    readonly session: SessionKeyRecord<'bookmark'>;
  } | null> | null = null;

  async load(): Promise<readonly ImageDisplayRecord[]> {
    const context = await this.openContext();
    if (!context) return [];

    const records = await context.repository.listEncrypted();
    const loaded: ImageDisplayRecord[] = [];
    for (const record of records) {
      try {
        const payload = await context.repository.open(record.uuid, context.session.key);
        if (payload) loaded.push(toDisplayRecord(record.uuid, payload));
      } catch {
        // Bookmarks encrypted with unavailable session keys stay durable but locked.
      }
    }
    return loaded.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }

  async save(record: ImageDisplayRecord): Promise<ImageDisplayRecord> {
    const context = await this.openContext();
    const bookmark = createDisplayRecord({ ...record, id: record.url, source: 'bookmark' });
    if (!context) return bookmark;

    const existing = await context.repository.getEncryptedByUrl(bookmark.url);
    const uuid = existing?.uuid ?? crypto.randomUUID();
    await context.repository.sealAndPut(uuid, toPayload(bookmark), context.session.key, context.session.reference);
    return { ...bookmark, id: uuid };
  }

  async remove(record: ImageDisplayRecord): Promise<void> {
    const context = await this.openContext();
    if (!context) return;
    const existing = (await context.repository.getEncrypted(record.id)) ?? (await context.repository.getEncryptedByUrl(record.url));
    if (existing) await context.repository.remove(existing.uuid);
  }

  private openContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: BookmarksRepository;
    readonly session: SessionKeyRecord<'bookmark'>;
  } | null> {
    this.ready ??= this.createContext();
    return this.ready;
  }

  private async createContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: BookmarksRepository;
    readonly session: SessionKeyRecord<'bookmark'>;
  } | null> {
    const result = await openImageTrailDb();
    if (!result.db) return null;
    const session = await createSessionKey('bookmark');
    await new KeysRepository(result.db).put(session.metadata);
    return { db: result.db, repository: new BookmarksRepository(result.db), session };
  }
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
  };
}

function toDisplayRecord(id: string, payload: DurableBookmarkPayloadV1): ImageDisplayRecord {
  return createDisplayRecord({
    id,
    url: payload.url,
    title: payload.title,
    label: payload.label,
    thumbnail: payload.thumbnail,
    timestamp: payload.bookmarkedAt,
    downloadedAt: payload.downloadedAt,
    capturedAt: payload.capturedAt,
    source: payload.sourceCompatibility ?? 'bookmark',
  });
}
