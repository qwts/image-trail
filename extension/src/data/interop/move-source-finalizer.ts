import { ensureDurableBookmarkKey } from '../durable-bookmark-key.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { BookmarksRepository, type EncryptedBookmarkRecord } from '../repositories/bookmarks-repository.js';
import { KeysRepository } from '../repositories/keys-repository.js';
import { DataStore } from '../schema.js';
import type { StoredBlobRecord } from '../types.js';

const FINALIZATION_STORES = [
  DataStore.Bookmarks,
  DataStore.EncryptedPins,
  DataStore.EncryptedPinThumbnails,
  DataStore.Blobs,
  DataStore.OriginalBlobIndex,
];

export async function finalizeInteropMoveSource(db: IDBDatabase, sourceLocalId: string): Promise<boolean> {
  const bookmarks = new BookmarksRepository(db);
  const encrypted = await bookmarks.getEncrypted(sourceLocalId);
  if (!encrypted) return false;
  const key = await ensureDurableBookmarkKey(new KeysRepository(db));
  const payload = await bookmarks.openRecord(encrypted, key.key);
  const transaction = db.transaction(FINALIZATION_STORES, 'readwrite');
  const bookmarkStore = transaction.objectStore(DataStore.Bookmarks);
  const current = await requestToPromise<EncryptedBookmarkRecord | undefined>(bookmarkStore.get(sourceLocalId));
  if (!current || current.envelope.updatedAt !== encrypted.envelope.updatedAt) {
    transaction.abort();
    throw new Error('Move source changed after review; finalization was stopped.');
  }
  if (payload.protectedPin?.encryptedPinId) transaction.objectStore(DataStore.EncryptedPins).delete(payload.protectedPin.encryptedPinId);
  if (payload.protectedPin?.encryptedThumbnailId) {
    transaction.objectStore(DataStore.EncryptedPinThumbnails).delete(payload.protectedPin.encryptedThumbnailId);
  }
  const blobId = payload.protectedPin?.storedOriginalBlobId ?? payload.storedOriginal?.blobId;
  if (blobId) await removeBlobReference(transaction, blobId);
  bookmarkStore.delete(sourceLocalId);
  await transactionDone(transaction);
  return true;
}

async function removeBlobReference(transaction: IDBTransaction, blobId: string): Promise<void> {
  const blobs = transaction.objectStore(DataStore.Blobs);
  const existing = await requestToPromise<StoredBlobRecord | undefined>(blobs.get(blobId));
  if (!existing) return;
  if (existing.referenceCount <= 1) {
    blobs.delete(blobId);
    transaction.objectStore(DataStore.OriginalBlobIndex).delete(blobId);
  } else {
    blobs.put({ ...existing, referenceCount: existing.referenceCount - 1 } satisfies StoredBlobRecord);
  }
}
