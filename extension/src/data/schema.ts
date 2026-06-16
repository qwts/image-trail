import type { DataStoreName } from './types.js';

export const IMAGE_TRAIL_DB_NAME = 'image-trail';
export const IMAGE_TRAIL_DB_VERSION = 1;

export const DataStore = {
  Metadata: 'metadata',
  Keys: 'keys',
  History: 'history',
} as const satisfies Record<string, DataStoreName>;

export const DATA_STORE_NAMES = Object.values(DataStore);

export const SchemaIndex = {
  KeysByKind: 'keys.byKind',
  KeysByUuid: 'keys.byUuid',
  KeysByReference: 'keys.byReference',
  HistoryByUpdatedAt: 'history.byUpdatedAt',
  HistoryByKeyReference: 'history.byKeyReference',
} as const;
