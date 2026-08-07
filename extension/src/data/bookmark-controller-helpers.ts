import { createDisplayRecord, type ImageDisplayRecord } from '../core/display-records.js';
import { queueTimeForRecord } from '../core/display-order.js';
import type { BookmarkSaveOptions } from '../core/bookmark-save-options.js';
import type { ActiveBlobKey } from './crypto/blob-keyring.js';
import type { EncryptedPinThumbnailsRepository } from './repositories/encrypted-pin-thumbnails-repository.js';
import type { DurableBookmarkPayloadV1, DurableEncryptedPinPayloadV1 } from './types.js';
import type { ProtectedPinRelationshipV1 } from './types.js';

export interface BookmarkPersistenceOptions extends BookmarkSaveOptions {
  readonly preserveExistingMetadata?: boolean | undefined;
  readonly preserveExistingThumbnail?: boolean | undefined;
  readonly requiredActiveBlobKey?: ActiveBlobKey | undefined;
}

export function clampPageOffset(offset: number, limit: number, total: number): number {
  if (total <= 0) return 0;
  const lastPageOffset = Math.floor((total - 1) / limit) * limit;
  return Math.min(offset, lastPageOffset);
}

export function filterByVisibilityScope(
  records: readonly ImageDisplayRecord[],
  scope: 'global' | 'site',
  currentPageUrl: string | undefined,
): readonly ImageDisplayRecord[] {
  return records.filter((record) => isVisibleInScope(record, scope, currentPageUrl));
}

export function isVisibleInScope(record: ImageDisplayRecord, scope: 'global' | 'site', currentPageUrl: string | undefined): boolean {
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

/** Queue ordering is `queueUpdatedAt`, never the encrypted envelope's `updatedAt`. */
export function recordQueueTime(record: ImageDisplayRecord): string {
  return queueTimeForRecord(record);
}

const protectedPinSaveLocks = new Map<string, Promise<void>>();

export async function withProtectedPinSaveLock<T>(urlHash: string, work: () => Promise<T>): Promise<T> {
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

export class BookmarkPersistenceError extends Error {
  constructor(
    message: string,
    readonly durableMetadataCommitted: boolean,
  ) {
    super(message);
  }
}

export async function removeReplacedOriginal(
  context: { readonly blobs: { remove(id: string): Promise<void> } },
  previous: DurableBookmarkPayloadV1 | null,
  nextBlobId: string | undefined,
): Promise<void> {
  const previousBlobId = previous?.protectedPin?.storedOriginalBlobId ?? previous?.storedOriginal?.blobId;
  if (previousBlobId && previousBlobId !== nextBlobId) await context.blobs.remove(previousBlobId);
}

export function preserveImportedBookmarkMetadata(
  record: ImageDisplayRecord,
  existing: DurableBookmarkPayloadV1 | DurableEncryptedPinPayloadV1 | null,
): ImageDisplayRecord {
  if (!existing) return record;
  return createDisplayRecord({
    ...record,
    title: existing.title ?? record.title,
    label: existing.label ?? record.label,
    width: existing.width ?? record.width,
    height: existing.height ?? record.height,
    timestamp: existing.bookmarkedAt,
    downloadedAt: existing.downloadedAt ?? record.downloadedAt,
  });
}

export function protectedImportOptions(activeBlobKey: ActiveBlobKey) {
  return { preserveExistingMetadata: true, preserveExistingThumbnail: true, requiredActiveBlobKey: activeBlobKey } as const;
}

export function dataUrlToBytes(dataUrl: string): { readonly mimeType: string; readonly bytes: ArrayBuffer } | null {
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

export async function saveProtectedThumbnail(
  context: { readonly encryptedThumbnails: EncryptedPinThumbnailsRepository },
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
