import type { ImageDisplayRecord } from '../core/display-records.js';
import { createDisplayRecord } from '../core/display-records.js';
import { computeSha256 } from '../core/image/fingerprints.js';
import type { BookmarkStore, PinSaveStoragePreference } from '../core/types.js';
import type { ActiveBlobKey } from './crypto/blob-keyring.js';
import { createKeyReference } from './crypto/key-reference.js';
import type { KeyReference, StoredKeyRecord } from './crypto/types.js';
import { generateAesGcmKey } from './crypto/webcrypto.js';
import { openImageTrailDb } from './db.js';
import { DEFAULT_LOCAL_SETTINGS } from './local-settings.js';
import { BlobsRepository } from './repositories/blobs-repository.js';
import { BookmarksRepository } from './repositories/bookmarks-repository.js';
import { EncryptedPinsRepository, type EncryptedPinRecord } from './repositories/encrypted-pins-repository.js';
import { EncryptedPinThumbnailsRepository } from './repositories/encrypted-pin-thumbnails-repository.js';
import { KeysRepository } from './repositories/keys-repository.js';
import type { DurableBookmarkPayloadV1, DurableEncryptedPinPayloadV1, ProtectedPinRelationshipV1 } from './types.js';

interface DurableBookmarkKeyRecord extends StoredKeyRecord<'bookmark'> {
  readonly key: CryptoKey;
}

interface BookmarkKeyContext {
  readonly reference: KeyReference<'bookmark'>;
  readonly key: CryptoKey;
}

interface ProtectedBookmarkOptions {
  readonly getActiveBlobKey?: () => ActiveBlobKey | null;
  readonly getPinSaveStoragePreference?: () => PinSaveStoragePreference | Promise<PinSaveStoragePreference>;
}

type BookmarkContext = {
  readonly db: IDBDatabase;
  readonly repository: BookmarksRepository;
  readonly bookmarkKey: BookmarkKeyContext;
  readonly encryptedPins: EncryptedPinsRepository;
  readonly encryptedThumbnails: EncryptedPinThumbnailsRepository;
  readonly blobs: BlobsRepository;
};

interface MergedRecordsCache {
  readonly keyReference: string;
  readonly records: readonly ImageDisplayRecord[];
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
  private ready: Promise<BookmarkContext | null> | null = null;
  private mergedRecordsCache: MergedRecordsCache | null = null;
  private mergedRecordsCacheGeneration = 0;

  constructor(private readonly options: ProtectedBookmarkOptions = {}) {}

  async load(): Promise<readonly ImageDisplayRecord[]> {
    return (await this.loadPage({ offset: 0, limit: DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax })).items;
  }

  async loadOriginalBlobIds(): Promise<ReadonlySet<string>> {
    const context = await this.openContext();
    const ids = new Set<string>();
    if (!context) return ids;
    for (const record of await context.repository.listEncryptedNewestFirst()) {
      try {
        const payload = await context.repository.openRecord(record, context.bookmarkKey.key);
        if (payload.storedOriginal?.blobId) ids.add(payload.storedOriginal.blobId);
        if (payload.protectedPin?.storedOriginalBlobId) ids.add(payload.protectedPin.storedOriginalBlobId);
      } catch {
        // Unreadable legacy rows cannot safely identify linked originals.
      }
    }
    return ids;
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

    const loaded = this.options.getActiveBlobKey ? await this.loadMergedRecords(context) : await this.loadPlainRecords(context);
    const visible = filterByVisibilityScope(loaded, input.scope ?? 'global', input.currentPageUrl);
    const total = visible.length;
    const clampedOffset = clampPageOffset(offset, limit, total);
    const pageItems = visible.slice(clampedOffset, clampedOffset + limit);
    const items = this.options.getActiveBlobKey ? await this.loadProtectedThumbnailsForRecords(context, pageItems) : pageItems;
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

    const activeBlobKey = this.options.getActiveBlobKey?.() ?? null;
    const preference = (await this.options.getPinSaveStoragePreference?.()) ?? DEFAULT_LOCAL_SETTINGS.pinSaveStoragePreference;
    if (preference === 'plaintext') {
      if (activeBlobKey && (await this.hasProtectedPinForBookmark(context, bookmark))) {
        return { ...(await this.saveProtected(context, bookmark, activeBlobKey)), pinSaveStorage: { destination: 'encrypted' } };
      }
      return this.savePlain(context, bookmark, { destination: 'plaintext', reason: 'setting' });
    }

    if (activeBlobKey) {
      try {
        return { ...(await this.saveProtected(context, bookmark, activeBlobKey)), pinSaveStorage: { destination: 'encrypted' } };
      } catch {
        return this.savePlain(context, bookmark, { destination: 'plaintext', reason: 'failed' });
      }
    }

    return this.savePlain(context, bookmark, {
      destination: 'plaintext',
      reason: this.options.getActiveBlobKey ? 'locked' : 'unavailable',
    });
  }

  private async savePlain(
    context: BookmarkContext,
    bookmark: ImageDisplayRecord,
    pinSaveStorage?: ImageDisplayRecord['pinSaveStorage'],
  ): Promise<ImageDisplayRecord> {
    const importedDataUrl = bookmark.url.startsWith('data:image/');

    const indexUrl = importedDataUrl ? `image-trail-import:${bookmark.id}` : bookmark.url;
    const existing = importedDataUrl
      ? await context.repository.getEncrypted(bookmark.id)
      : await context.repository.getEncryptedByUrl(bookmark.url);
    const existingPayload = existing ? await context.repository.openRecord(existing, context.bookmarkKey.key).catch(() => null) : null;
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
    await removeReplacedOriginal(context, existingPayload, bookmark.storedOriginal?.blobId ?? bookmark.blobId);
    this.invalidateMergedRecordsCache();
    return { ...bookmark, id: uuid, pinSaveStorage };
  }

  private async hasProtectedPinForBookmark(context: BookmarkContext, bookmark: ImageDisplayRecord): Promise<boolean> {
    return !!(await context.encryptedPins.getByUrlHash(await hashUrl(bookmark.url)));
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

    if (this.options.getActiveBlobKey) {
      const loaded = await this.loadMergedRecords(context);
      const visible = filterByVisibilityScope(loaded, input.scope ?? 'global', input.currentPageUrl);
      const items = [...(await this.loadProtectedThumbnailsForRecords(context, visible.slice(offset, offset + limit + 1)))];
      const hasMore = items.length > limit;
      if (hasMore) items.length = limit;
      return {
        items,
        offset,
        limit,
        nextOffset: offset + items.length,
        hasMore,
        total: visible.length,
        failedCount: 0,
      };
    }

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
          if (payload) items.push(toDisplayRecord(record.uuid, payload, record.queueUpdatedAt));
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
    this.invalidateMergedRecordsCache();
    if (this.options.getActiveBlobKey) {
      const protectedUpdates: Array<{ readonly id: string; readonly queueUpdatedAt: string }> = [];
      for (const update of updated) {
        try {
          const payload = await context.repository.openRecord(update, context.bookmarkKey.key);
          if (payload.protectedPin?.encryptedPinId) {
            protectedUpdates.push({ id: payload.protectedPin.encryptedPinId, queueUpdatedAt: update.queueUpdatedAt });
          }
        } catch {
          // Undecryptable relationship rows cannot be moved in the protected store.
        }
      }
      await context.encryptedPins.updateQueueUpdatedAt(protectedUpdates);
      return this.loadRecordsByIds(context, uniqueIds);
    }
    const records: ImageDisplayRecord[] = [];
    for (const record of updated) {
      try {
        const payload = await context.repository.openRecord(record, context.bookmarkKey.key);
        records.push(toDisplayRecord(record.uuid, payload, record.queueUpdatedAt));
      } catch {
        // If a record cannot be decrypted, it was not successfully recalled.
      }
    }
    return records;
  }

  async loadByIds(ids: readonly string[]): Promise<readonly ImageDisplayRecord[]> {
    const context = await this.openContext();
    if (!context) return [];
    return this.loadRecordsByIds(context, [...new Set(ids)].filter(Boolean));
  }

  async remove(record: ImageDisplayRecord): Promise<void> {
    await this.removeMany([record.id]);
  }

  async removeMany(ids: readonly string[]): Promise<{ readonly removedCount: number }> {
    const context = await this.openContext();
    if (!context) return { removedCount: 0 };
    let removedCount = 0;
    for (const id of [...new Set(ids)].filter(Boolean)) {
      const existing = await context.repository.getEncrypted(id);
      if (!existing) continue;
      try {
        const payload = await context.repository.openRecord(existing, context.bookmarkKey.key);
        await removeLinkedPinStorage(context, payload);
      } catch {
        // Still remove the relationship row if its protected side cannot be opened.
      }
      await context.repository.remove(existing.uuid);
      removedCount += 1;
    }
    if (removedCount > 0) this.invalidateMergedRecordsCache();
    return { removedCount };
  }

  async removeRecallPage(input: {
    readonly offset: number;
    readonly scope?: 'global' | 'site';
    readonly currentPageUrl?: string;
  }): Promise<{ readonly removedCount: number }> {
    const context = await this.openContext();
    if (!context) return { removedCount: 0 };
    const records = this.options.getActiveBlobKey ? await this.loadMergedRecords(context) : await this.loadPlainRecords(context);
    const visible = filterByVisibilityScope(records, input.scope ?? 'global', input.currentPageUrl);
    const ids = visible.slice(Math.max(0, input.offset)).map((record) => record.id);
    return this.removeMany(ids);
  }

  async close(): Promise<void> {
    const context = await this.ready;
    context?.db.close();
    this.ready = null;
  }

  private openContext(): Promise<BookmarkContext | null> {
    this.ready ??= this.createContext();
    return this.ready;
  }

  private async createContext(): Promise<BookmarkContext | null> {
    const result = await openImageTrailDb();
    if (!result.db) return null;
    const bookmarkKey = await ensureDurableBookmarkKey(new KeysRepository(result.db));
    return {
      db: result.db,
      repository: new BookmarksRepository(result.db),
      bookmarkKey,
      encryptedPins: new EncryptedPinsRepository(result.db),
      encryptedThumbnails: new EncryptedPinThumbnailsRepository(result.db),
      blobs: new BlobsRepository(result.db),
    };
  }

  private async loadPlainRecords(context: BookmarkContext): Promise<readonly ImageDisplayRecord[]> {
    const records = await context.repository.listEncryptedNewestFirst();
    const loaded: ImageDisplayRecord[] = [];
    for (const record of records) {
      try {
        const payload = await context.repository.openRecord(record, context.bookmarkKey.key);
        if (payload) loaded.push(toDisplayRecord(record.uuid, payload, record.queueUpdatedAt));
      } catch {
        // Bookmarks encrypted with unavailable legacy keys stay durable but hidden.
      }
    }
    return loaded;
  }

  private async loadMergedRecords(context: BookmarkContext): Promise<readonly ImageDisplayRecord[]> {
    const activeBlobKey = this.options.getActiveBlobKey?.() ?? null;
    const plain = [...(await this.loadPlainRecords(context))];
    if (!activeBlobKey) return plain;
    const keyReference = activeBlobKey.reference.reference;
    if (this.mergedRecordsCache?.keyReference === keyReference) return this.mergedRecordsCache.records;
    const cacheGeneration = this.mergedRecordsCacheGeneration;

    const byId = new Map(plain.map((record) => [record.id, record]));
    const urlToId = new Map(plain.filter((record) => record.privacyStatus !== 'locked').map((record) => [record.url, record.id]));
    for (const encrypted of await context.encryptedPins.listNewestFirst()) {
      try {
        const display = await this.openProtectedDisplayRecord(context, encrypted, activeBlobKey, { includeThumbnail: false });
        const duplicateId = urlToId.get(display.url);
        if (duplicateId) byId.delete(duplicateId);
        byId.set(display.id, display);
      } catch {
        // Keep the relationship row placeholder if protected metadata cannot be decrypted.
      }
    }
    const records = [...byId.values()].sort((left, right) => recordQueueTime(right).localeCompare(recordQueueTime(left)));
    if (this.mergedRecordsCacheGeneration === cacheGeneration) {
      this.mergedRecordsCache = { keyReference, records };
    }
    return records;
  }

  private async loadRecordsByIds(context: BookmarkContext, ids: readonly string[]): Promise<readonly ImageDisplayRecord[]> {
    const activeBlobKey = this.options.getActiveBlobKey?.() ?? null;
    const records: ImageDisplayRecord[] = [];
    for (const id of ids) {
      const relationship = await context.repository.getEncrypted(id);
      if (!relationship) continue;
      try {
        const payload = await context.repository.openRecord(relationship, context.bookmarkKey.key);
        if (payload.protectedPin?.encryptedPinId && activeBlobKey) {
          const encrypted = await context.encryptedPins.get(payload.protectedPin.encryptedPinId);
          if (encrypted) {
            records.push(await this.openProtectedDisplayRecord(context, encrypted, activeBlobKey));
            continue;
          }
        }
        records.push(toDisplayRecord(relationship.uuid, payload, relationship.queueUpdatedAt));
      } catch {
        // If a targeted row cannot be opened, it was not successfully recalled.
      }
    }
    return records;
  }

  private async saveProtected(
    context: BookmarkContext,
    bookmark: ImageDisplayRecord,
    activeBlobKey: ActiveBlobKey,
  ): Promise<ImageDisplayRecord> {
    const urlHash = await hashUrl(bookmark.url);
    return withProtectedPinSaveLock(urlHash, () => this.saveProtectedForHash(context, bookmark, activeBlobKey, urlHash));
  }

  private async saveProtectedForHash(
    context: BookmarkContext,
    bookmark: ImageDisplayRecord,
    activeBlobKey: ActiveBlobKey,
    urlHash: string,
  ): Promise<ImageDisplayRecord> {
    const existingProtected = await context.encryptedPins.getByUrlHash(urlHash);
    const plainPinId = existingProtected?.plainPinId ?? crypto.randomUUID();
    const existingPlain = await context.repository.getEncrypted(plainPinId);
    const encryptedPinId = existingProtected?.id ?? crypto.randomUUID();
    const existingPlainPayload = existingPlain
      ? await context.repository.openRecord(existingPlain, context.bookmarkKey.key).catch(() => null)
      : null;
    const queueUpdatedAt = existingPlain?.queueUpdatedAt ?? existingProtected?.queueUpdatedAt ?? bookmark.timestamp;
    let thumbnail: { readonly id: string } | null = null;
    try {
      thumbnail = await this.saveProtectedThumbnail(context, bookmark, activeBlobKey, plainPinId, existingPlainPayload?.protectedPin);
      const protectedRecord = await context.encryptedPins.sealAndPut({
        id: encryptedPinId,
        plainPinId,
        urlHash,
        queueUpdatedAt,
        payload: toProtectedPayload(bookmark, thumbnail?.id),
        key: activeBlobKey.key,
        keyReference: activeBlobKey.reference,
        now: existingProtected?.envelope.updatedAt,
      });

      const relationship = protectedRelationship({
        plainPinId,
        encryptedPinId,
        encryptedThumbnailId: thumbnail?.id ?? existingPlainPayload?.protectedPin?.encryptedThumbnailId,
        storedOriginalBlobId: bookmark.storedOriginal?.blobId ?? bookmark.blobId,
        queueUpdatedAt,
      });
      await context.repository.sealAndPut(
        plainPinId,
        toRelationshipPayload(relationship),
        context.bookmarkKey.key,
        context.bookmarkKey.reference,
        existingPlain?.envelope.updatedAt,
        privatePinUrl(plainPinId),
        queueUpdatedAt,
      );

      await removeReplacedOriginal(context, existingPlainPayload, relationship.storedOriginalBlobId);
      this.invalidateMergedRecordsCache();
      return this.openProtectedDisplayRecord(context, protectedRecord, activeBlobKey);
    } catch (error) {
      const existingThumbnailId = existingPlainPayload?.protectedPin?.encryptedThumbnailId;
      if (thumbnail?.id && thumbnail.id !== existingThumbnailId) await context.encryptedThumbnails.remove(thumbnail.id);
      if (!existingProtected) await context.encryptedPins.remove(encryptedPinId);
      this.invalidateMergedRecordsCache();
      throw error;
    }
  }

  private async saveProtectedThumbnail(
    context: BookmarkContext,
    bookmark: ImageDisplayRecord,
    activeBlobKey: ActiveBlobKey,
    plainPinId: string,
    existing?: ProtectedPinRelationshipV1,
  ): Promise<{ readonly id: string } | null> {
    if (!bookmark.thumbnail?.startsWith('data:image/')) return null;
    const parsed = dataUrlToBytes(bookmark.thumbnail);
    if (!parsed) return null;
    const id = existing?.encryptedThumbnailId ?? crypto.randomUUID();
    await context.encryptedThumbnails.sealAndPut({
      id,
      pinId: plainPinId,
      mimeType: parsed.mimeType,
      bytes: parsed.bytes,
      key: activeBlobKey.key,
      keyReference: activeBlobKey.reference,
    });
    return { id };
  }

  private async openProtectedDisplayRecord(
    context: BookmarkContext,
    record: EncryptedPinRecord,
    activeBlobKey: ActiveBlobKey,
    options: { readonly includeThumbnail?: boolean } = {},
  ): Promise<ImageDisplayRecord> {
    const payload = await context.encryptedPins.openRecord(record, activeBlobKey.key);
    const thumbnail =
      options.includeThumbnail !== false && payload.thumbnailId
        ? await this.openProtectedThumbnail(context, payload.thumbnailId, activeBlobKey)
        : undefined;
    const storedOriginal = payload.storedOriginal;
    return createDisplayRecord({
      id: record.plainPinId,
      url: payload.url,
      title: payload.title,
      label: payload.label,
      thumbnail,
      width: payload.width,
      height: payload.height,
      timestamp: payload.bookmarkedAt,
      queueUpdatedAt: record.queueUpdatedAt,
      downloadedAt: payload.downloadedAt,
      capturedAt: payload.capturedAt ?? storedOriginal?.capturedAt,
      captureStatus: storedOriginal ? 'captured' : undefined,
      blobId: storedOriginal?.blobId,
      storedOriginal,
      source: payload.sourceCompatibility ?? 'bookmark',
      privacyStatus: 'unlocked',
      protectedPin: protectedRelationship({
        plainPinId: record.plainPinId,
        encryptedPinId: record.id,
        encryptedThumbnailId: payload.thumbnailId,
        storedOriginalBlobId: payload.storedOriginal?.blobId,
        queueUpdatedAt: record.queueUpdatedAt,
      }),
    });
  }

  private async loadProtectedThumbnailsForRecords(
    context: BookmarkContext,
    records: readonly ImageDisplayRecord[],
  ): Promise<readonly ImageDisplayRecord[]> {
    const activeBlobKey = this.options.getActiveBlobKey?.() ?? null;
    if (!activeBlobKey) return records;
    const loaded: ImageDisplayRecord[] = [];
    for (const record of records) {
      const thumbnailId = record.protectedPin?.encryptedThumbnailId;
      if (!thumbnailId || record.thumbnail) {
        loaded.push(record);
        continue;
      }
      const thumbnail = await this.openProtectedThumbnail(context, thumbnailId, activeBlobKey).catch(() => undefined);
      loaded.push(thumbnail ? createDisplayRecord({ ...record, thumbnail }) : record);
    }
    return loaded;
  }

  private invalidateMergedRecordsCache(): void {
    this.mergedRecordsCacheGeneration += 1;
    this.mergedRecordsCache = null;
  }

  private async openProtectedThumbnail(
    context: BookmarkContext,
    thumbnailId: string,
    activeBlobKey: ActiveBlobKey,
  ): Promise<string | undefined> {
    const record = await context.encryptedThumbnails.get(thumbnailId);
    if (!record || record.key.reference !== activeBlobKey.reference.reference) return undefined;
    return (await context.encryptedThumbnails.openRecord(record, activeBlobKey.key)).dataUrl;
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
          const displayRecord = payload ? toDisplayRecord(record.uuid, payload, record.queueUpdatedAt) : null;
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

async function removeLinkedPinStorage(context: BookmarkContext, payload: DurableBookmarkPayloadV1): Promise<void> {
  if (payload.protectedPin?.encryptedPinId) await context.encryptedPins.remove(payload.protectedPin.encryptedPinId);
  if (payload.protectedPin?.encryptedThumbnailId) await context.encryptedThumbnails.remove(payload.protectedPin.encryptedThumbnailId);
  const protectedOriginalBlobId = payload.protectedPin?.storedOriginalBlobId;
  if (protectedOriginalBlobId) {
    await context.blobs.remove(protectedOriginalBlobId);
    return;
  }
  if (payload.storedOriginal?.blobId) await context.blobs.remove(payload.storedOriginal.blobId);
}

async function removeReplacedOriginal(
  context: BookmarkContext,
  previous: DurableBookmarkPayloadV1 | null,
  nextBlobId: string | undefined,
): Promise<void> {
  const previousBlobId = previous?.protectedPin?.storedOriginalBlobId ?? previous?.storedOriginal?.blobId;
  if (!previousBlobId || previousBlobId === nextBlobId) return;
  await context.blobs.remove(previousBlobId);
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
    width: record.width,
    height: record.height,
    bookmarkedAt: record.timestamp,
    downloadedAt: record.downloadedAt,
    capturedAt: record.capturedAt,
    sourceCompatibility: 'favorites',
    storedOriginal: record.storedOriginal,
    protectedPin: record.protectedPin
      ? protectedRelationship({
          plainPinId: record.protectedPin.plainPinId,
          encryptedPinId: record.protectedPin.encryptedPinId,
          encryptedThumbnailId: record.protectedPin.encryptedThumbnailId,
          storedOriginalBlobId: record.protectedPin.storedOriginalBlobId,
          queueUpdatedAt: record.timestamp,
        })
      : undefined,
  };
}

function toDisplayRecord(id: string, payload: DurableBookmarkPayloadV1, queueUpdatedAt?: string): ImageDisplayRecord {
  if (payload.protectedPin) {
    return createDisplayRecord({
      id,
      url: payload.url || privatePinUrl(payload.protectedPin.plainPinId),
      label: 'Private pin',
      timestamp: payload.protectedPin.queueUpdatedAt,
      queueUpdatedAt: queueUpdatedAt ?? payload.protectedPin.queueUpdatedAt,
      source: payload.sourceCompatibility ?? 'bookmark',
      privacyStatus: 'locked',
      protectedPin: {
        plainPinId: payload.protectedPin.plainPinId,
        encryptedPinId: payload.protectedPin.encryptedPinId,
        encryptedThumbnailId: payload.protectedPin.encryptedThumbnailId,
        storedOriginalBlobId: payload.protectedPin.storedOriginalBlobId,
        hasEncryptedMetadata: payload.protectedPin.hasEncryptedMetadata,
        hasEncryptedThumbnail: payload.protectedPin.hasEncryptedThumbnail,
        hasStoredOriginal: payload.protectedPin.hasStoredOriginal,
      },
    });
  }
  const storedOriginal = payload.storedOriginal;
  return createDisplayRecord({
    id,
    url: payload.url,
    title: payload.title,
    label: payload.label,
    thumbnail: payload.thumbnail,
    width: payload.width,
    height: payload.height,
    timestamp: payload.bookmarkedAt,
    queueUpdatedAt,
    downloadedAt: payload.downloadedAt,
    capturedAt: payload.capturedAt ?? storedOriginal?.capturedAt,
    captureStatus: storedOriginal ? 'captured' : undefined,
    blobId: storedOriginal?.blobId,
    storedOriginal,
    source: payload.sourceCompatibility ?? 'bookmark',
  });
}

function toProtectedPayload(record: ImageDisplayRecord, thumbnailId: string | undefined): DurableEncryptedPinPayloadV1 {
  return {
    url: record.url,
    title: record.title,
    label: record.label,
    width: record.width,
    height: record.height,
    bookmarkedAt: record.timestamp,
    downloadedAt: record.downloadedAt,
    capturedAt: record.capturedAt,
    sourceCompatibility: 'favorites',
    storedOriginal: record.storedOriginal,
    thumbnailId,
  };
}

function toRelationshipPayload(relationship: ProtectedPinRelationshipV1): DurableBookmarkPayloadV1 {
  return {
    url: privatePinUrl(relationship.plainPinId),
    label: 'Private pin',
    bookmarkedAt: relationship.queueUpdatedAt,
    sourceCompatibility: 'favorites',
    protectedPin: relationship,
  };
}

function protectedRelationship(input: {
  readonly plainPinId: string;
  readonly encryptedPinId?: string;
  readonly encryptedThumbnailId?: string;
  readonly storedOriginalBlobId?: string;
  readonly queueUpdatedAt: string;
}): ProtectedPinRelationshipV1 {
  return {
    schemaVersion: 1,
    plainPinId: input.plainPinId,
    encryptedPinId: input.encryptedPinId,
    encryptedThumbnailId: input.encryptedThumbnailId,
    storedOriginalBlobId: input.storedOriginalBlobId,
    queueUpdatedAt: input.queueUpdatedAt,
    hasEncryptedMetadata: !!input.encryptedPinId,
    hasEncryptedThumbnail: !!input.encryptedThumbnailId,
    hasStoredOriginal: !!input.storedOriginalBlobId,
  };
}

function privatePinUrl(plainPinId: string): string {
  return `image-trail-private:${plainPinId}`;
}

function recordQueueTime(record: ImageDisplayRecord): string {
  return record.queueUpdatedAt ?? record.timestamp;
}

const protectedPinSaveLocks = new Map<string, Promise<void>>();

async function withProtectedPinSaveLock<T>(urlHash: string, work: () => Promise<T>): Promise<T> {
  const previous = protectedPinSaveLocks.get(urlHash) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => undefined).then(() => current);
  protectedPinSaveLocks.set(urlHash, next);
  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
    if (protectedPinSaveLocks.get(urlHash) === next) protectedPinSaveLocks.delete(urlHash);
  }
}

async function hashUrl(url: string): Promise<string> {
  return computeSha256(new TextEncoder().encode(url).buffer);
}

function dataUrlToBytes(dataUrl: string): { readonly mimeType: string; readonly bytes: ArrayBuffer } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[2]!.replace(/\s/gu, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return { mimeType: match[1]!.toLowerCase(), bytes: bytes.buffer };
  } catch {
    return null;
  }
}
