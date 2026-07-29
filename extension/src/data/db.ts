import { IMAGE_TRAIL_DB_NAME, IMAGE_TRAIL_DB_VERSION } from './schema.js';
import { migrateImageTrailDb } from './migrations.js';
import type { RecoverableDataStatus } from './types.js';

export interface OpenImageTrailDbResult {
  readonly db: IDBDatabase | null;
  readonly status: RecoverableDataStatus;
}

export function openImageTrailDb(indexedDb: IDBFactory = globalThis.indexedDB): Promise<OpenImageTrailDbResult> {
  return new Promise((resolve) => {
    const request = indexedDb.open(IMAGE_TRAIL_DB_NAME, IMAGE_TRAIL_DB_VERSION);
    let settled = false;
    const settle = (result: OpenImageTrailDbResult): boolean => {
      if (settled) return false;
      settled = true;
      resolve(result);
      return true;
    };
    request.onupgradeneeded = (event) => {
      try {
        migrateImageTrailDb(request.result, event.oldVersion, request.transaction ?? undefined);
      } catch (cause) {
        request.transaction?.abort();
        settle({
          db: null,
          status: { ok: false, code: 'migration-failed', message: 'Image Trail storage migration failed recoverably.', cause },
        });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!settle({ db, status: { ok: true, code: 'ok', message: 'Image Trail storage opened.' } })) db.close();
    };
    request.onerror = () =>
      settle({
        db: null,
        status: { ok: false, code: 'db-open-failed', message: 'Image Trail storage could not be opened.', cause: request.error },
      });
    request.onblocked = () =>
      settle({
        db: null,
        status: { ok: false, code: 'db-open-failed', message: 'Image Trail storage open was blocked by another context.' },
      });
  });
}
