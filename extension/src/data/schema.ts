import type { DataStoreName } from './types.js';

export const IMAGE_TRAIL_DB_NAME = 'image-trail';
export const IMAGE_TRAIL_DB_VERSION = 5;

export const DataStore = {
  Metadata: 'metadata',
  Keys: 'keys',
  History: 'history',
  Bookmarks: 'bookmarks',
  Blobs: 'blobs',
  Downloads: 'downloads',
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
  BookmarksByKeyReference: 'bookmarks.byKeyReference',
  BlobsBySha256: 'blobs.bySha256',
  BlobsByCreatedAt: 'blobs.byCreatedAt',
  BlobsByKeyReference: 'blobs.byKeyReference',
  DownloadsByDownloadedAt: 'downloads.byDownloadedAt',
  DownloadsByKeyReference: 'downloads.byKeyReference',
} as const;
