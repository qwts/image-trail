import type { DataStoreName } from './types.js';

export const IMAGE_TRAIL_DB_NAME = 'image-trail';
export const IMAGE_TRAIL_DB_VERSION = 9;

export const DataStore = {
  Metadata: 'metadata',
  Keys: 'keys',
  History: 'history',
  Bookmarks: 'bookmarks',
  Blobs: 'blobs',
  OriginalBlobIndex: 'originalBlobIndex',
  Downloads: 'downloads',
  EncryptedPins: 'encryptedPins',
  EncryptedPinThumbnails: 'encryptedPinThumbnails',
  Albums: 'albums',
  AlbumMemberships: 'albumMemberships',
} as const satisfies Record<string, DataStoreName>;

export const DATA_STORE_NAMES = Object.values(DataStore);

export const SchemaIndex = {
  KeysByKind: 'keys.byKind',
  KeysByUuid: 'keys.byUuid',
  KeysByReference: 'keys.byReference',
  HistoryByUpdatedAt: 'history.byUpdatedAt',
  HistoryByKeyReference: 'history.byKeyReference',
  BookmarksByUrl: 'bookmarks.byUrl',
  BookmarksByUpdatedAt: 'bookmarks.byUpdatedAt',
  BookmarksByQueueUpdatedAt: 'bookmarks.byQueueUpdatedAt',
  BookmarksByKeyReference: 'bookmarks.byKeyReference',
  BlobsBySha256: 'blobs.bySha256',
  BlobsByCreatedAt: 'blobs.byCreatedAt',
  BlobsByKeyReference: 'blobs.byKeyReference',
  DownloadsByDownloadedAt: 'downloads.byDownloadedAt',
  DownloadsByKeyReference: 'downloads.byKeyReference',
  EncryptedPinsByPlainPinId: 'encryptedPins.byPlainPinId',
  EncryptedPinsByUrlHash: 'encryptedPins.byUrlHash',
  EncryptedPinsByQueueUpdatedAt: 'encryptedPins.byQueueUpdatedAt',
  EncryptedPinsByKeyReference: 'encryptedPins.byKeyReference',
  EncryptedPinThumbnailsByPinId: 'encryptedPinThumbnails.byPinId',
  EncryptedPinThumbnailsByCreatedAt: 'encryptedPinThumbnails.byCreatedAt',
  EncryptedPinThumbnailsByByteLength: 'encryptedPinThumbnails.byByteLength',
  EncryptedPinThumbnailsByKeyReference: 'encryptedPinThumbnails.byKeyReference',
  AlbumsByUpdatedAt: 'albums.byUpdatedAt',
  AlbumMembershipsByAlbumId: 'albumMemberships.byAlbumId',
  AlbumMembershipsByRecordId: 'albumMemberships.byRecordId',
  AlbumMembershipsByAlbumPosition: 'albumMemberships.byAlbumPosition',
  AlbumMembershipsByAlbumRecord: 'albumMemberships.byAlbumRecord',
} as const;
