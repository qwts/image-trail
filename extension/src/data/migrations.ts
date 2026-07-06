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
    const blobs = db.createObjectStore(DataStore.Blobs, { keyPath: 'id' });
    blobs.createIndex(SchemaIndex.BlobsBySha256, 'sha256', { unique: false });
    blobs.createIndex(SchemaIndex.BlobsByCreatedAt, 'createdAt', { unique: false });
  }

  if (oldVersion < 4) {
    if (db.objectStoreNames.contains(DataStore.Blobs)) {
      const blobs = requireUpgradeTransaction(transaction).objectStore(DataStore.Blobs);
      if (blobs.indexNames.contains(SchemaIndex.BlobsBySha256)) {
        blobs.deleteIndex(SchemaIndex.BlobsBySha256);
      }
      if (!blobs.indexNames.contains(SchemaIndex.BlobsByCreatedAt)) {
        blobs.createIndex(SchemaIndex.BlobsByCreatedAt, 'createdAt', { unique: false });
      }
      if (!blobs.indexNames.contains(SchemaIndex.BlobsByKeyReference)) {
        blobs.createIndex(SchemaIndex.BlobsByKeyReference, 'key.reference', { unique: false });
      }
    } else {
      const blobs = db.createObjectStore(DataStore.Blobs, { keyPath: 'id' });
      blobs.createIndex(SchemaIndex.BlobsByCreatedAt, 'createdAt', { unique: false });
      blobs.createIndex(SchemaIndex.BlobsByKeyReference, 'key.reference', { unique: false });
    }
  }

  if (oldVersion < 5) {
    const downloads = db.objectStoreNames.contains(DataStore.Downloads)
      ? requireUpgradeTransaction(transaction).objectStore(DataStore.Downloads)
      : db.createObjectStore(DataStore.Downloads, { keyPath: 'uuid' });
    if (!downloads.indexNames.contains(SchemaIndex.DownloadsByDownloadedAt)) {
      downloads.createIndex(SchemaIndex.DownloadsByDownloadedAt, 'envelope.updatedAt', { unique: false });
    }
    if (!downloads.indexNames.contains(SchemaIndex.DownloadsByKeyReference)) {
      downloads.createIndex(SchemaIndex.DownloadsByKeyReference, 'envelope.key.reference', { unique: false });
    }
  }

  if (oldVersion < 6) {
    const bookmarks = requireUpgradeTransaction(transaction).objectStore(DataStore.Bookmarks);
    if (!bookmarks.indexNames.contains(SchemaIndex.BookmarksByQueueUpdatedAt)) {
      bookmarks.createIndex(SchemaIndex.BookmarksByQueueUpdatedAt, 'queueUpdatedAt', { unique: false });
    }
    const request = bookmarks.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as { readonly queueUpdatedAt?: string; readonly envelope?: { readonly updatedAt?: string } };
      if (!record.queueUpdatedAt) {
        cursor.update({ ...record, queueUpdatedAt: record.envelope?.updatedAt ?? new Date().toISOString() });
      }
      cursor.continue();
    };
  }

  if (oldVersion < 7) {
    const encryptedPins = db.objectStoreNames.contains(DataStore.EncryptedPins)
      ? requireUpgradeTransaction(transaction).objectStore(DataStore.EncryptedPins)
      : db.createObjectStore(DataStore.EncryptedPins, { keyPath: 'id' });
    if (!encryptedPins.indexNames.contains(SchemaIndex.EncryptedPinsByPlainPinId)) {
      encryptedPins.createIndex(SchemaIndex.EncryptedPinsByPlainPinId, 'plainPinId', { unique: true });
    }
    if (!encryptedPins.indexNames.contains(SchemaIndex.EncryptedPinsByUrlHash)) {
      encryptedPins.createIndex(SchemaIndex.EncryptedPinsByUrlHash, 'urlHash', { unique: false });
    }
    if (!encryptedPins.indexNames.contains(SchemaIndex.EncryptedPinsByQueueUpdatedAt)) {
      encryptedPins.createIndex(SchemaIndex.EncryptedPinsByQueueUpdatedAt, 'queueUpdatedAt', { unique: false });
    }
    if (!encryptedPins.indexNames.contains(SchemaIndex.EncryptedPinsByKeyReference)) {
      encryptedPins.createIndex(SchemaIndex.EncryptedPinsByKeyReference, 'envelope.key.reference', { unique: false });
    }

    const thumbnails = db.objectStoreNames.contains(DataStore.EncryptedPinThumbnails)
      ? requireUpgradeTransaction(transaction).objectStore(DataStore.EncryptedPinThumbnails)
      : db.createObjectStore(DataStore.EncryptedPinThumbnails, { keyPath: 'id' });
    if (!thumbnails.indexNames.contains(SchemaIndex.EncryptedPinThumbnailsByPinId)) {
      thumbnails.createIndex(SchemaIndex.EncryptedPinThumbnailsByPinId, 'pinId', { unique: false });
    }
    if (!thumbnails.indexNames.contains(SchemaIndex.EncryptedPinThumbnailsByCreatedAt)) {
      thumbnails.createIndex(SchemaIndex.EncryptedPinThumbnailsByCreatedAt, 'createdAt', { unique: false });
    }
    if (!thumbnails.indexNames.contains(SchemaIndex.EncryptedPinThumbnailsByByteLength)) {
      thumbnails.createIndex(SchemaIndex.EncryptedPinThumbnailsByByteLength, 'byteLength', { unique: false });
    }
    if (!thumbnails.indexNames.contains(SchemaIndex.EncryptedPinThumbnailsByKeyReference)) {
      thumbnails.createIndex(SchemaIndex.EncryptedPinThumbnailsByKeyReference, 'key.reference', { unique: false });
    }
  }

  if (oldVersion < 8) {
    const albums = db.objectStoreNames.contains(DataStore.Albums)
      ? requireUpgradeTransaction(transaction).objectStore(DataStore.Albums)
      : db.createObjectStore(DataStore.Albums, { keyPath: 'id' });
    if (!albums.indexNames.contains(SchemaIndex.AlbumsByUpdatedAt)) {
      albums.createIndex(SchemaIndex.AlbumsByUpdatedAt, 'updatedAt', { unique: false });
    }

    const memberships = db.objectStoreNames.contains(DataStore.AlbumMemberships)
      ? requireUpgradeTransaction(transaction).objectStore(DataStore.AlbumMemberships)
      : db.createObjectStore(DataStore.AlbumMemberships, { keyPath: 'id' });
    if (!memberships.indexNames.contains(SchemaIndex.AlbumMembershipsByAlbumId)) {
      memberships.createIndex(SchemaIndex.AlbumMembershipsByAlbumId, 'albumId', { unique: false });
    }
    if (!memberships.indexNames.contains(SchemaIndex.AlbumMembershipsByRecordId)) {
      memberships.createIndex(SchemaIndex.AlbumMembershipsByRecordId, 'recordId', { unique: false });
    }
    if (!memberships.indexNames.contains(SchemaIndex.AlbumMembershipsByAlbumPosition)) {
      memberships.createIndex(SchemaIndex.AlbumMembershipsByAlbumPosition, ['albumId', 'position'], { unique: false });
    }
    if (!memberships.indexNames.contains(SchemaIndex.AlbumMembershipsByAlbumRecord)) {
      memberships.createIndex(SchemaIndex.AlbumMembershipsByAlbumRecord, ['albumId', 'recordId'], { unique: true });
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
