import * as v from 'valibot';
import { interopReviewCategorySchema, interopTimestampSchema, type InteropReviewCategory } from '../../core/interop/contract.js';
import { interopAlbumSchema, interopRecordSchema, type InteropAlbum, type InteropRecord } from '../../core/interop/records.js';
import { openImageTrailDb } from '../db.js';
import { ensureDurableBookmarkKey, type DurableBookmarkKeyContext } from '../durable-bookmark-key.js';
import { AlbumsRepository } from '../repositories/albums-repository.js';
import { BookmarksRepository, type EncryptedBookmarkRecord } from '../repositories/bookmarks-repository.js';
import { KeysRepository } from '../repositories/keys-repository.js';
import type { DurableBookmarkPayloadV1, DurableInteropRecordV1, StoredOriginalReference } from '../types.js';

const INTERNAL_RECORD_PREFIX = 'image-trail-interop:';
const INTERNAL_ALBUM_PREFIX = 'image-trail-interop-album:';

interface TranslationContext {
  readonly db: IDBDatabase;
  readonly bookmarks: BookmarksRepository;
  readonly albums: AlbumsRepository;
  readonly bookmarkKey: DurableBookmarkKeyContext;
}

export interface InteropRecordTranslationInput {
  readonly record: InteropRecord;
  readonly albums: readonly InteropAlbum[];
  readonly reviewCategory: InteropReviewCategory;
  readonly receivedAt?: string | undefined;
  readonly verifiedThumbnailDataUrl?: string | undefined;
  readonly verifiedOriginal?: StoredOriginalReference | undefined;
}

export interface InteropRecordPreview {
  readonly category: InteropReviewCategory;
  readonly existingPinId: string | null;
  readonly displayUrl: string;
  readonly sourceUrlAvailable: boolean;
  readonly originalBytesAvailable: boolean;
  readonly thumbnailBytesAvailable: boolean;
  readonly reason: string;
}

export interface InteropRecordImportResult extends InteropRecordPreview {
  readonly persisted: boolean;
  readonly pinId: string | null;
}

export interface InteropRecordExport {
  readonly record: InteropRecord;
  readonly albums: readonly InteropAlbum[];
  readonly reviewCategory: InteropReviewCategory;
}

interface StoredInteropPin {
  readonly encrypted: EncryptedBookmarkRecord;
  readonly payload: DurableBookmarkPayloadV1;
  readonly custody: DurableInteropRecordV1;
}

export class InteropRecordTranslationStore {
  private ready: Promise<TranslationContext | null> | null = null;

  async preview(input: InteropRecordTranslationInput): Promise<InteropRecordPreview> {
    const normalized = normalizeInput(input);
    const context = await this.openContext();
    const stored = context ? await listStoredInteropPins(context) : [];
    return previewNormalized(normalized, stored);
  }

  async importRecord(input: InteropRecordTranslationInput): Promise<InteropRecordImportResult> {
    const normalized = normalizeInput(input);
    const context = await this.openContext();
    if (!context) {
      const preview = previewNormalized(normalized, []);
      return { ...preview, persisted: false, pinId: null };
    }

    const stored = await listStoredInteropPins(context);
    const preview = previewNormalized(normalized, stored);
    const enrichment = duplicateCustodyEnrichment(normalized, preview, stored);
    if (!isPersistable(preview.category) && !enrichment) {
      return { ...preview, persisted: false, pinId: preview.existingPinId };
    }

    const localOrigin = enrichment?.encrypted ?? (await localOriginTarget(context, normalized.record));
    const previous = localOrigin ? await context.bookmarks.openRecord(localOrigin, context.bookmarkKey.key).catch(() => null) : null;
    const pinId = localOrigin?.uuid ?? crypto.randomUUID();
    const displayUrl = interopDisplayUrl(normalized.record);
    const now = normalized.receivedAt ?? canonicalQueueTime(normalized.record);
    const payload = translatePayload(normalized, displayUrl, previous);
    const indexUrl = `${INTERNAL_RECORD_PREFIX}${normalized.record.identity.interopId}`;

    await context.bookmarks.sealAndPut(
      pinId,
      payload,
      context.bookmarkKey.key,
      context.bookmarkKey.reference,
      localOrigin?.envelope.updatedAt ?? now,
      indexUrl,
      localOrigin?.queueUpdatedAt ?? now,
    );
    await syncCanonicalAlbums(context, normalized.albums, now);
    return { ...preview, existingPinId: localOrigin?.uuid ?? null, persisted: true, pinId };
  }

  async exportRecord(interopId: string): Promise<InteropRecordExport | null> {
    const context = await this.openContext();
    if (!context) return null;
    const stored = (await listStoredInteropPins(context)).find((item) => item.custody.record.identity.interopId === interopId);
    if (!stored) return null;
    return {
      record: stored.custody.record,
      albums: stored.custody.albums,
      reviewCategory: stored.custody.reviewCategory,
    };
  }

  async close(): Promise<void> {
    const context = await this.ready;
    context?.db.close();
    this.ready = null;
  }

  private async openContext(): Promise<TranslationContext | null> {
    this.ready ??= (async () => {
      const opened = await openImageTrailDb();
      if (!opened.db) return null;
      return {
        db: opened.db,
        bookmarks: new BookmarksRepository(opened.db),
        albums: new AlbumsRepository(opened.db),
        bookmarkKey: await ensureDurableBookmarkKey(new KeysRepository(opened.db)),
      };
    })();
    return this.ready;
  }
}

function normalizeInput(input: InteropRecordTranslationInput): InteropRecordTranslationInput {
  const record = v.parse(interopRecordSchema, input.record);
  const albums = v.parse(v.pipe(v.array(interopAlbumSchema), v.readonly()), input.albums);
  const reviewCategory = v.parse(interopReviewCategorySchema, input.reviewCategory);
  const receivedAt = input.receivedAt ? v.parse(interopTimestampSchema, input.receivedAt) : undefined;
  assertVerifiedCustody(record, input.verifiedThumbnailDataUrl, input.verifiedOriginal);
  return { ...input, record, albums, reviewCategory, receivedAt };
}

function assertVerifiedCustody(
  record: InteropRecord,
  verifiedThumbnailDataUrl: string | undefined,
  verifiedOriginal: StoredOriginalReference | undefined,
): void {
  if (verifiedThumbnailDataUrl) {
    if (record.thumbnail.state !== 'available' || !verifiedThumbnailDataUrl.startsWith('data:image/')) {
      throw new Error('Verified thumbnail bytes do not match an available image thumbnail.');
    }
  }
  if (verifiedOriginal) {
    if (
      record.original.state !== 'available' ||
      verifiedOriginal.mimeType !== record.original.mimeType ||
      verifiedOriginal.byteLength !== record.original.byteLength
    ) {
      throw new Error('Verified original custody does not match the canonical original metadata.');
    }
  }
}

function previewNormalized(input: InteropRecordTranslationInput, stored: readonly StoredInteropPin[]): InteropRecordPreview {
  const exactIdentity = stored.find((item) => item.custody.record.identity.interopId === input.record.identity.interopId);
  if (exactIdentity) {
    const exact =
      JSON.stringify({ record: exactIdentity.custody.record, albums: exactIdentity.custody.albums }) ===
      JSON.stringify({ record: input.record, albums: input.albums });
    return previewResult(
      input,
      exact ? 'duplicate' : 'conflict',
      exactIdentity.encrypted.uuid,
      exact ? 'Canonical interop identity and record already exist.' : 'Canonical interop identity has divergent metadata or revisions.',
    );
  }

  const contentDuplicate = input.record.identity.contentHash
    ? stored.find((item) => item.custody.record.identity.contentHash === input.record.identity.contentHash)
    : undefined;
  if (contentDuplicate) {
    return previewResult(
      input,
      'duplicate',
      contentDuplicate.encrypted.uuid,
      'Canonical content hash already exists under another identity.',
    );
  }

  const originConflict = stored.find(
    (item) =>
      item.custody.record.identity.origin.product === input.record.identity.origin.product &&
      item.custody.record.identity.origin.localId === input.record.identity.origin.localId,
  );
  if (originConflict) {
    return previewResult(
      input,
      'conflict',
      originConflict.encrypted.uuid,
      'Origin product and local identity map to a different interop identity.',
    );
  }

  if (input.record.deletedAt)
    return previewResult(input, 'skipped', null, 'Deleted canonical records are retained by journals, not added to the queue.');
  return previewResult(input, input.reviewCategory, null, categoryReason(input.reviewCategory));
}

function previewResult(
  input: InteropRecordTranslationInput,
  category: InteropReviewCategory,
  existingPinId: string | null,
  reason: string,
): InteropRecordPreview {
  return {
    category,
    existingPinId,
    displayUrl: interopDisplayUrl(input.record),
    sourceUrlAvailable: input.record.sourceUrl !== null,
    originalBytesAvailable: !!input.verifiedOriginal,
    thumbnailBytesAvailable: !!input.verifiedThumbnailDataUrl,
    reason,
  };
}

function duplicateCustodyEnrichment(
  input: InteropRecordTranslationInput,
  preview: InteropRecordPreview,
  stored: readonly StoredInteropPin[],
): StoredInteropPin | null {
  if (preview.category !== 'duplicate' || !preview.existingPinId) return null;
  const existing = stored.find((item) => item.encrypted.uuid === preview.existingPinId);
  if (!existing || existing.custody.record.identity.interopId !== input.record.identity.interopId) return null;
  const addsThumbnail = !!input.verifiedThumbnailDataUrl && !existing.payload.thumbnail;
  const addsOriginal = !!input.verifiedOriginal && !existing.payload.storedOriginal;
  return addsThumbnail || addsOriginal ? existing : null;
}

function translatePayload(
  input: InteropRecordTranslationInput,
  displayUrl: string,
  previous: DurableBookmarkPayloadV1 | null,
): DurableBookmarkPayloadV1 {
  const record = input.record;
  return {
    url: displayUrl,
    title: record.title ?? undefined,
    label: record.label ?? undefined,
    thumbnail: input.verifiedThumbnailDataUrl ?? retainedThumbnail(record, previous),
    width: record.dimensions?.width,
    height: record.dimensions?.height,
    bookmarkedAt: record.timestamps.bookmarkedAt ?? canonicalQueueTime(record),
    downloadedAt: record.timestamps.downloadedAt ?? undefined,
    capturedAt: record.timestamps.capturedAt ?? undefined,
    sourceCompatibility: record.sourceCompatibility === 'favorites' ? 'favorites' : undefined,
    storedOriginal: input.verifiedOriginal ?? retainedOriginal(record, previous),
    interop: {
      schemaVersion: 1,
      record,
      albums: input.albums,
      reviewCategory: input.reviewCategory,
    },
  };
}

function retainedOriginal(record: InteropRecord, previous: DurableBookmarkPayloadV1 | null): StoredOriginalReference | undefined {
  if (!canRetainLocalBytes(record, previous) || record.original.state !== 'available') return undefined;
  const original = previous?.storedOriginal;
  return original?.mimeType === record.original.mimeType && original.byteLength === record.original.byteLength ? original : undefined;
}

function retainedThumbnail(record: InteropRecord, previous: DurableBookmarkPayloadV1 | null): string | undefined {
  return canRetainLocalBytes(record, previous) && record.thumbnail.state === 'available' ? previous?.thumbnail : undefined;
}

function canRetainLocalBytes(record: InteropRecord, previous: DurableBookmarkPayloadV1 | null): boolean {
  return previous?.interop?.record.identity.interopId === record.identity.interopId || record.identity.origin.product === 'image-trail';
}

async function localOriginTarget(context: TranslationContext, record: InteropRecord): Promise<EncryptedBookmarkRecord | null> {
  if (record.identity.origin.product !== 'image-trail') return null;
  const encrypted = await context.bookmarks.getEncrypted(record.identity.origin.localId);
  if (!encrypted) return null;
  const payload = await context.bookmarks.openRecord(encrypted, context.bookmarkKey.key).catch(() => null);
  return payload?.protectedPin ? null : encrypted;
}

async function listStoredInteropPins(context: TranslationContext): Promise<readonly StoredInteropPin[]> {
  const result: StoredInteropPin[] = [];
  for (const encrypted of await context.bookmarks.listEncrypted()) {
    try {
      const payload = await context.bookmarks.openRecord(encrypted, context.bookmarkKey.key);
      if (payload.interop) result.push({ encrypted, payload, custody: payload.interop });
    } catch {
      // Unreadable durable records are quarantined and cannot participate in deterministic matching.
    }
  }
  return result;
}

async function syncCanonicalAlbums(context: TranslationContext, albums: readonly InteropAlbum[], now: string): Promise<void> {
  if (albums.length === 0) return;
  const stored = await listStoredInteropPins(context);
  const pinIdByInteropId = new Map(stored.map((item) => [item.custody.record.identity.interopId, item.encrypted.uuid]));
  for (const album of albums) {
    if (album.deletedAt) continue;
    const localAlbumId = `${INTERNAL_ALBUM_PREFIX}${album.interopId}`;
    const existing = await context.albums.getAlbum(localAlbumId);
    if (!existing) await context.albums.createAlbum(album.name, { id: localAlbumId, now });
    else if (existing.name !== album.name) await context.albums.renameAlbum(localAlbumId, album.name, now);
    const memberIds = [...album.members]
      .sort((left, right) => left.position - right.position)
      .map((member) => pinIdByInteropId.get(member.recordInteropId))
      .filter((id): id is string => !!id);
    await context.albums.replaceRecords(localAlbumId, memberIds, now);
  }
}

function interopDisplayUrl(record: InteropRecord): string {
  return record.sourceUrl ?? `${INTERNAL_RECORD_PREFIX}${record.identity.interopId}`;
}

function canonicalQueueTime(record: InteropRecord): string {
  return (
    record.timestamps.bookmarkedAt ??
    record.timestamps.importedAt ??
    record.timestamps.capturedAt ??
    record.timestamps.takenAt ??
    record.timestamps.downloadedAt ??
    '1970-01-01T00:00:00.000Z'
  );
}

function isPersistable(category: InteropReviewCategory): boolean {
  return category === 'eligible' || category === 'metadata-only';
}

function categoryReason(category: InteropReviewCategory): string {
  switch (category) {
    case 'eligible':
      return 'Canonical record is eligible for durable queue persistence.';
    case 'metadata-only':
      return 'Canonical metadata is durable while original bytes remain unavailable.';
    case 'duplicate':
      return 'Source classified the record as a duplicate.';
    case 'conflict':
      return 'Source classified the record as a conflict requiring review.';
    case 'unsupported':
      return 'Source classified the record as unsupported.';
    case 'skipped':
      return 'Source classified the record as skipped.';
  }
}
