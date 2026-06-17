import { DataStore, SchemaIndex, IMAGE_TRAIL_DB_VERSION } from './schema.js';
import type { VersionMetadataRecord } from './types.js';

export function migrateImageTrailDb(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const metadata = db.createObjectStore(DataStore.Metadata, { keyPath: 'key' });
    const keys = db.createObjectStore(DataStore.Keys, { keyPath: 'reference' });
    keys.createIndex(SchemaIndex.KeysByKind, 'kind', { unique: false });
    keys.createIndex(SchemaIndex.KeysByUuid, 'uuid', { unique: true });
    keys.createIndex(SchemaIndex.KeysByReference, 'reference', { unique: true });
    const history = db.createObjectStore(DataStore.History, { keyPath: 'uuid' });
    history.createIndex(SchemaIndex.HistoryByUpdatedAt, 'envelope.updatedAt', { unique: false });
    history.createIndex(SchemaIndex.HistoryByKeyReference, 'envelope.key.reference', { unique: false });
    metadata.put({
      key: 'schema',
      databaseVersion: IMAGE_TRAIL_DB_VERSION,
      migratedAt: new Date().toISOString(),
    } satisfies VersionMetadataRecord);
  }
}
