import { IMAGE_TRAIL_DB_NAME, IMAGE_TRAIL_DB_VERSION } from './schema.js';
import { migrateImageTrailDb } from './migrations.js';
import type { RecoverableDataStatus } from './types.js';

export interface OpenImageTrailDbResult { readonly db: IDBDatabase | null; readonly status: RecoverableDataStatus; }

export function openImageTrailDb(indexedDb: IDBFactory = globalThis.indexedDB): Promise<OpenImageTrailDbResult> {
  return new Promise((resolve) => {
    const request = indexedDb.open(IMAGE_TRAIL_DB_NAME, IMAGE_TRAIL_DB_VERSION);
    request.onupgradeneeded = (event) => {
      try { migrateImageTrailDb(request.result, event.oldVersion); }
      catch (cause) { request.transaction?.abort(); resolve({ db: null, status: { ok: false, code: 'migration-failed', message: 'Image Trail storage migration failed recoverably.', cause } }); }
    };
    request.onsuccess = () => resolve({ db: request.result, status: { ok: true, code: 'ok', message: 'Image Trail storage opened.' } });
    request.onerror = () => resolve({ db: null, status: { ok: false, code: 'db-open-failed', message: 'Image Trail storage could not be opened.', cause: request.error } });
    request.onblocked = () => resolve({ db: null, status: { ok: false, code: 'db-open-failed', message: 'Image Trail storage open was blocked by another context.' } });
  });
}
