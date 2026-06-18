import { DataStore, SchemaIndex, IMAGE_TRAIL_DB_VERSION } from './schema.js';
import type { VersionMetadataRecord } from './types.js';

export function migrateImageTrailDb(db: IDBDatabase, oldVersion: number, transaction?: IDBTransaction): void {
  if (oldVersion < 1) {
    db.createObjectStore(DataStore.Metadata, { keyPath: 'key' });
    const keys = db.createObjectStore(DataStore.Keys, { keyPath: 'reference' });
    keys.createIndex(SchemaIndex.KeysByKind, 'kind', { unique: false });
    keys.createIndex(SchemaIndex.KeysByUuid, 'uuid', { unique: true });
    keys.createIndex(SchemaIndex.KeysByReference, 'reference', { unique: true });
    const history = db.createObjectStore(DataStore.History, { keyPath: 'uuid' });
    history.createIndex(SchemaIndex.HistoryByUpdatedAt, 'envelope.updatedAt', { unique: false });
    history.createIndex(SchemaIndex.HistoryByKeyReference, 'envelope.key.reference', { unique: false });
  }

  if (oldVersion < 2) {
    const bookmarks = db.objectStoreNames.contains(DataStore.Bookmarks)
      ? requireUpgradeTransaction(transaction).objectStore(DataStore.Bookmarks)
      : db.createObjectStore(DataStore.Bookmarks, { keyPath: 'uuid' });
    if (!bookmarks.indexNames.contains(SchemaIndex.BookmarksByUrl)) {
      bookmarks.createIndex(SchemaIndex.BookmarksByUrl, 'url', { unique: true });
    }
    if (!bookmarks.indexNames.contains(SchemaIndex.BookmarksByUpdatedAt)) {
      bookmarks.createIndex(SchemaIndex.BookmarksByUpdatedAt, 'envelope.updatedAt', { unique: false });
    }
    if (!bookmarks.indexNames.contains(SchemaIndex.BookmarksByKeyReference)) {
      bookmarks.createIndex(SchemaIndex.BookmarksByKeyReference, 'envelope.key.reference', { unique: false });
    }
  }

  if (oldVersion < 3) {
    const imageBlobs = db.objectStoreNames.contains(DataStore.ImageBlobs)
      ? requireUpgradeTransaction(transaction).objectStore(DataStore.ImageBlobs)
      : db.createObjectStore(DataStore.ImageBlobs, { keyPath: 'uuid' });
    if (!imageBlobs.indexNames.contains(SchemaIndex.ImageBlobsBySha256)) {
      imageBlobs.createIndex(SchemaIndex.ImageBlobsBySha256, 'sha256', { unique: true });
    }
    if (!imageBlobs.indexNames.contains(SchemaIndex.ImageBlobsByCreatedAt)) {
      imageBlobs.createIndex(SchemaIndex.ImageBlobsByCreatedAt, 'createdAt', { unique: false });
    }

    const captureAttempts = db.objectStoreNames.contains(DataStore.CaptureAttempts)
      ? requireUpgradeTransaction(transaction).objectStore(DataStore.CaptureAttempts)
      : db.createObjectStore(DataStore.CaptureAttempts, { keyPath: 'uuid' });
    if (!captureAttempts.indexNames.contains(SchemaIndex.CaptureAttemptsByCreatedAt)) {
      captureAttempts.createIndex(SchemaIndex.CaptureAttemptsByCreatedAt, 'createdAt', { unique: false });
    }

    if (!db.objectStoreNames.contains(DataStore.StorageStats)) {
      db.createObjectStore(DataStore.StorageStats, { keyPath: 'key' });
    }
  }

  const metadata = transaction?.objectStore(DataStore.Metadata);
  metadata?.put({
    key: 'schema',
    databaseVersion: IMAGE_TRAIL_DB_VERSION,
    migratedAt: new Date().toISOString(),
  } satisfies VersionMetadataRecord);
}

function requireUpgradeTransaction(transaction: IDBTransaction | undefined): IDBTransaction {
  if (!transaction) {
    throw new Error('Migration requires the active upgrade transaction.');
  }
  return transaction;
}
