import * as v from 'valibot';

import type { InteropReviewCategory, InteropRevisionVector } from '../../core/interop/contract.js';
import { interopRecordSchema, type InteropBlobReference, type InteropRecord } from '../../core/interop/records.js';
import { ensureDurableBookmarkKey } from '../durable-bookmark-key.js';
import type { ActiveBlobKey } from '../crypto/blob-keyring.js';
import { BookmarksRepository, type EncryptedBookmarkRecord } from '../repositories/bookmarks-repository.js';
import { EncryptedPinsRepository, type EncryptedPinRecord } from '../repositories/encrypted-pins-repository.js';
import { KeysRepository } from '../repositories/keys-repository.js';
import type { DurableBookmarkPayloadV1, DurableEncryptedPinPayloadV1, DurableInteropRecordV1 } from '../types.js';

export interface CanonicalRecordExport {
  readonly localId: string;
  readonly record: InteropRecord;
  readonly albums: DurableInteropRecordV1['albums'];
  readonly reviewCategory: InteropReviewCategory;
}

export interface CanonicalRecordExportReview {
  readonly requested: number;
  readonly unsupported: number;
  readonly records: readonly CanonicalRecordExport[];
}

interface RecordExportOptions {
  readonly now?: (() => string) | undefined;
  readonly createId?: (() => string) | undefined;
}

const INITIAL_REVISION: InteropRevisionVector = { imageTrail: 1, overlook: 0 };
type ExportPayload = DurableBookmarkPayloadV1 | DurableEncryptedPinPayloadV1;

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function sourceUrl(value: string): string | null {
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function timestamp(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function dimensions(payload: ExportPayload): InteropRecord['dimensions'] {
  return Number.isSafeInteger(payload.width) && Number.isSafeInteger(payload.height) && payload.width! > 0 && payload.height! > 0
    ? { width: payload.width!, height: payload.height! }
    : null;
}

function unavailableBlob(reason: 'not-captured' | 'provider-unavailable'): InteropBlobReference {
  return {
    state: reason === 'not-captured' ? 'unavailable' : 'metadata-only',
    blobId: null,
    mimeType: null,
    byteLength: null,
    contentHash: null,
    reason,
  };
}

function originalReference(payload: ExportPayload): InteropBlobReference {
  const original = payload.storedOriginal;
  return original
    ? {
        state: 'metadata-only',
        blobId: null,
        mimeType: original.mimeType,
        byteLength: original.byteLength,
        contentHash: null,
        reason: 'provider-unavailable',
      }
    : unavailableBlob('not-captured');
}

function thumbnailReference(payload: ExportPayload): InteropBlobReference {
  const thumbnail = 'thumbnail' in payload ? payload.thumbnail : 'thumbnailId' in payload ? payload.thumbnailId : undefined;
  if (!thumbnail) return unavailableBlob('not-captured');
  const mimeType = /^data:([^;,]+)[;,]/u.exec(thumbnail)?.[1] ?? null;
  return {
    state: 'metadata-only',
    blobId: null,
    mimeType,
    byteLength: null,
    contentHash: null,
    reason: 'provider-unavailable',
  };
}

function canonicalRecord(localId: string, payload: ExportPayload, interopId: string): InteropRecord | null {
  const url = sourceUrl(payload.url);
  if (url === null) return null;
  const revision = INITIAL_REVISION;
  return v.parse(interopRecordSchema, {
    schemaVersion: 1,
    identity: { interopId, origin: { product: 'image-trail', localId }, contentHash: null },
    revision,
    fieldRevisions: {
      title: revision,
      label: revision,
      sourceUrl: revision,
      dimensions: revision,
      thumbnail: revision,
      timestamps: revision,
      original: revision,
      albums: revision,
      sourceCompatibility: revision,
      roundTripMetadata: revision,
    },
    recordKind: 'web-bookmark',
    title: nonEmpty(payload.title),
    label: nonEmpty(payload.label),
    sourceUrl: url,
    dimensions: dimensions(payload),
    timestamps: {
      bookmarkedAt: timestamp(payload.bookmarkedAt),
      capturedAt: timestamp(payload.capturedAt),
      downloadedAt: timestamp(payload.downloadedAt),
      takenAt: null,
      importedAt: null,
    },
    sourceCompatibility: payload.sourceCompatibility ?? null,
    original: originalReference(payload),
    thumbnail: thumbnailReference(payload),
    albumIds: [],
    roundTripMetadata: { imageTrail: {}, overlook: {} },
    deletedAt: null,
  });
}

function custody(localId: string, payload: ExportPayload, createId: () => string): DurableInteropRecordV1 | null {
  if (payload.interop) return payload.interop;
  const record = canonicalRecord(localId, payload, createId());
  if (record === null) return null;
  return {
    schemaVersion: 1,
    record,
    albums: [],
    reviewCategory: payload.storedOriginal ? 'metadata-only' : 'eligible',
  };
}

export class InteropRecordExportStore {
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(
    private readonly db: IDBDatabase,
    options: RecordExportOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#createId = options.createId ?? (() => crypto.randomUUID());
  }

  async review(recordIds: readonly string[], activeBlobKey: ActiveBlobKey | null = null): Promise<CanonicalRecordExportReview> {
    const uniqueIds = [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))];
    const bookmarks = new BookmarksRepository(this.db);
    const encryptedPins = new EncryptedPinsRepository(this.db);
    const key = await ensureDurableBookmarkKey(new KeysRepository(this.db));
    const records: CanonicalRecordExport[] = [];
    let unsupported = 0;
    for (const localId of uniqueIds) {
      const encrypted = await bookmarks.getEncrypted(localId);
      const payload = await this.open(bookmarks, encrypted, key.key);
      const protectedPin = await this.openProtected(encryptedPins, payload, activeBlobKey);
      const exportPayload = protectedPin
        ? { ...protectedPin.payload, interop: protectedPin.payload.interop ?? payload?.interop }
        : payload?.protectedPin
          ? null
          : payload;
      const interop = exportPayload ? custody(localId, exportPayload, this.#createId) : null;
      if (!encrypted || !payload || !exportPayload || !interop) {
        unsupported += 1;
        continue;
      }
      if (protectedPin && activeBlobKey) {
        if (!protectedPin.payload.interop || payload.interop) {
          await encryptedPins.sealAndPut({
            id: protectedPin.record.id,
            plainPinId: protectedPin.record.plainPinId,
            urlHash: protectedPin.record.urlHash,
            queueUpdatedAt: protectedPin.record.queueUpdatedAt,
            payload: { ...protectedPin.payload, interop },
            key: activeBlobKey.key,
            keyReference: activeBlobKey.reference,
            now: this.#now(),
          });
        }
        if (payload.interop) {
          await bookmarks.sealAndPut(
            encrypted.uuid,
            { ...payload, interop: undefined },
            key.key,
            key.reference,
            this.#now(),
            encrypted.url,
            encrypted.queueUpdatedAt,
          );
        }
      } else if (!payload.interop) {
        await bookmarks.sealAndPut(
          encrypted.uuid,
          { ...payload, interop },
          key.key,
          key.reference,
          this.#now(),
          encrypted.url,
          encrypted.queueUpdatedAt,
        );
      }
      records.push({
        localId,
        record: interop.record,
        albums: interop.albums,
        reviewCategory: interop.reviewCategory,
      });
    }
    return { requested: uniqueIds.length, unsupported, records };
  }

  private async open(
    bookmarks: BookmarksRepository,
    encrypted: EncryptedBookmarkRecord | undefined,
    key: CryptoKey,
  ): Promise<DurableBookmarkPayloadV1 | null> {
    if (!encrypted) return null;
    try {
      return await bookmarks.openRecord(encrypted, key);
    } catch {
      return null;
    }
  }

  private async openProtected(
    pins: EncryptedPinsRepository,
    relationship: DurableBookmarkPayloadV1 | null,
    activeBlobKey: ActiveBlobKey | null,
  ): Promise<{ readonly record: EncryptedPinRecord; readonly payload: DurableEncryptedPinPayloadV1 } | null> {
    const id = relationship?.protectedPin?.encryptedPinId;
    if (!id || !activeBlobKey) return null;
    const record = await pins.get(id);
    if (!record || record.plainPinId !== relationship.protectedPin?.plainPinId) return null;
    try {
      return { record, payload: await pins.openRecord(record, activeBlobKey.key) };
    } catch {
      return null;
    }
  }
}
