import { createDisplayRecord, type ImageDisplayRecord } from '../core/display-records.js';
import type { DurableBookmarkPayloadV1, DurableEncryptedPinPayloadV1, ProtectedPinRelationshipV1 } from './types.js';

export function toBookmarkPayload(
  record: ImageDisplayRecord,
  existing?: DurableBookmarkPayloadV1 | null,
  options: { readonly preserveExistingOriginal?: boolean } = {},
): DurableBookmarkPayloadV1 {
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
    storedOriginal:
      record.storedOriginal ?? (record.blobId || options.preserveExistingOriginal === false ? undefined : existing?.storedOriginal),
    protectedPin: record.protectedPin
      ? protectedRelationship({
          plainPinId: record.protectedPin.plainPinId,
          encryptedPinId: record.protectedPin.encryptedPinId,
          encryptedThumbnailId: record.protectedPin.encryptedThumbnailId,
          storedOriginalBlobId: record.protectedPin.storedOriginalBlobId,
          queueUpdatedAt: record.timestamp,
        })
      : undefined,
    interop: existing?.interop,
  };
}

export function toDisplayRecord(id: string, payload: DurableBookmarkPayloadV1, queueUpdatedAt?: string): ImageDisplayRecord {
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

export function toProtectedPayload(
  record: ImageDisplayRecord,
  thumbnailId: string | undefined,
  interop?: DurableEncryptedPinPayloadV1['interop'],
  existingStoredOriginal?: DurableEncryptedPinPayloadV1['storedOriginal'],
): DurableEncryptedPinPayloadV1 {
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
    storedOriginal: record.storedOriginal ?? (record.blobId ? undefined : existingStoredOriginal),
    thumbnailId,
    interop,
  };
}

export function toRelationshipPayload(relationship: ProtectedPinRelationshipV1): DurableBookmarkPayloadV1 {
  return {
    url: privatePinUrl(relationship.plainPinId),
    label: 'Private pin',
    bookmarkedAt: relationship.queueUpdatedAt,
    sourceCompatibility: 'favorites',
    protectedPin: relationship,
  };
}

export function protectedRelationship(input: {
  readonly plainPinId: string;
  readonly encryptedPinId?: string | undefined;
  readonly encryptedThumbnailId?: string | undefined;
  readonly storedOriginalBlobId?: string | undefined;
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

export function privatePinUrl(plainPinId: string): string {
  return `image-trail-private:${plainPinId}`;
}
