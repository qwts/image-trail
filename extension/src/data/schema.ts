import type { DataStoreName } from './types.js';

export const IMAGE_TRAIL_DB_NAME = 'image-trail';
export const IMAGE_TRAIL_DB_VERSION = 3;

export const DataStore = {
  Metadata: 'metadata',
  Keys: 'keys',
  History: 'history',
  Bookmarks: 'bookmarks',
  ImageBlobs: 'imageBlobs',
  CaptureAttempts: 'captureAttempts',
  StorageStats: 'storageStats',
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
  ImageBlobsBySha256: 'imageBlobs.bySha256',
  ImageBlobsByCreatedAt: 'imageBlobs.byCreatedAt',
  CaptureAttemptsByCreatedAt: 'captureAttempts.byCreatedAt',
} as const;
