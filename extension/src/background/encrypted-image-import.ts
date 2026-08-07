import { createDisplayRecord, type ImageDisplayRecord } from '../core/display-records.js';
import { sealBlobPayload } from '../data/crypto/binary-envelope.js';
import type { ActiveBlobKey } from '../data/crypto/blob-keyring.js';
import { openEncryptedImageFile, parseEncryptedImageFileHeader } from '../data/import-export/encrypted-image.js';
import { BlobsRepository } from '../data/repositories/blobs-repository.js';
import type { StoredBlobRecord } from '../data/types.js';

type BookmarkSaveResult =
  | { readonly ok: true; readonly record: ImageDisplayRecord }
  | { readonly ok: false; readonly message: string; readonly durableMetadataCommitted?: boolean };

export type DurableEncryptedImageImportResult =
  | { readonly ok: true; readonly fileName: string; readonly record: ImageDisplayRecord }
  | { readonly ok: false; readonly reason: string; readonly message: string };

export interface EncryptedImageImportDeps {
  readonly restoreActiveBlobKey: () => Promise<ActiveBlobKey | null>;
  readonly getDb: () => Promise<IDBDatabase | null>;
  readonly findBookmarkByUrl?: ((url: string) => Promise<ImageDisplayRecord | null>) | undefined;
  readonly saveBookmark: (record: ImageDisplayRecord, activeBlobKey: ActiveBlobKey) => Promise<BookmarkSaveResult>;
  readonly createBlobsRepository?: ((db: IDBDatabase) => Pick<BlobsRepository, 'put' | 'remove'>) | undefined;
  readonly notifyBookmarkSaved?: ((record: ImageDisplayRecord) => void) | undefined;
  readonly now?: (() => string) | undefined;
  readonly randomUuid?: (() => string) | undefined;
}

export async function importEncryptedImageToDurableStorage(
  fileContent: string,
  deps: EncryptedImageImportDeps,
): Promise<DurableEncryptedImageImportResult> {
  let expectedKeyReference: string;
  try {
    expectedKeyReference = parseEncryptedImageFileHeader(fileContent).keyReference;
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid-format',
      message: error instanceof Error ? error.message : 'Encrypted image import file is invalid.',
    };
  }

  const activeBlobKey = await deps.restoreActiveBlobKey();
  if (!activeBlobKey) {
    return { ok: false, reason: 'encryption-locked', message: 'Unlock encrypted originals before importing encrypted images.' };
  }
  if (activeBlobKey.reference.reference !== expectedKeyReference) {
    return { ok: false, reason: 'wrong-key', message: `Unlock ${expectedKeyReference} before importing this encrypted image.` };
  }

  let opened: Awaited<ReturnType<typeof openEncryptedImageFile>>;
  try {
    opened = await openEncryptedImageFile(fileContent, activeBlobKey.key, expectedKeyReference);
  } catch (error) {
    return {
      ok: false,
      reason: 'decryption-failed',
      message: error instanceof Error ? error.message : 'Encrypted image import failed.',
    };
  }

  const db = await deps.getDb();
  if (!db) return { ok: false, reason: 'storage-unavailable', message: 'Bookmark storage is unavailable.' };
  const blobs = deps.createBlobsRepository?.(db) ?? new BlobsRepository(db);
  const capturedAt = deps.now?.() ?? new Date().toISOString();
  const blobId = deps.randomUuid?.() ?? crypto.randomUUID();
  const aad = {
    id: blobId,
    kind: 'original' as const,
    schemaVersion: 1 as const,
    algorithm: 'AES-GCM' as const,
    createdAt: capturedAt,
    key: activeBlobKey.reference,
  };
  let blobStored = false;
  try {
    const bytes = opened.bytes.buffer.slice(opened.bytes.byteOffset, opened.bytes.byteOffset + opened.bytes.byteLength) as ArrayBuffer;
    const sealed = await sealBlobPayload({
      key: activeBlobKey.key,
      aad,
      metadata: {
        mimeType: opened.mimeType,
        byteLength: opened.bytes.byteLength,
        sourceUrl: opened.sourceUrl,
        capturedAt,
        fileName: opened.fileName,
      },
      bytes,
    });
    const stored: StoredBlobRecord = {
      ...aad,
      iv: sealed.iv,
      ciphertext: sealed.ciphertext,
      encryptedByteLength: sealed.encryptedByteLength,
      referenceCount: 1,
    };
    await blobs.put(stored);
    blobStored = true;

    const url = protectedImportUrl(opened.sourceUrl, blobId);
    const existing = await deps.findBookmarkByUrl?.(url);
    const draft = createDisplayRecord({
      ...existing,
      id: url,
      url,
      title: existing?.title ?? opened.fileName,
      label: existing?.label ?? opened.fileName,
      timestamp: existing?.timestamp ?? capturedAt,
      queueUpdatedAt: existing?.queueUpdatedAt ?? capturedAt,
      source: 'bookmark',
      capturedAt,
      captureStatus: 'captured',
      blobId,
      storedOriginal: {
        blobId,
        mimeType: opened.mimeType,
        byteLength: opened.bytes.byteLength,
        capturedAt,
        fileName: opened.fileName,
      },
    });
    const saved = await deps.saveBookmark(draft, activeBlobKey);
    if (!saved.ok) {
      if (!saved.durableMetadataCommitted) await blobs.remove(blobId);
      blobStored = false;
      return { ok: false, reason: 'durable-save-failed', message: saved.message };
    }
    blobStored = false;
    try {
      deps.notifyBookmarkSaved?.(saved.record);
    } catch {
      // Durable import success must not depend on optional UI refresh observers.
    }
    return { ok: true, fileName: opened.fileName, record: { ...saved.record, thumbnail: undefined } };
  } catch (error) {
    if (blobStored) await blobs.remove(blobId).catch(() => undefined);
    return {
      ok: false,
      reason: 'storage-failed',
      message: error instanceof Error ? error.message : 'Encrypted image import could not be stored.',
    };
  }
}

function protectedImportUrl(sourceUrl: string, blobId: string): string {
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    // Encrypted payloads may contain a former data URL; never return or persist it.
  }
  return `image-trail-private:${blobId}`;
}
