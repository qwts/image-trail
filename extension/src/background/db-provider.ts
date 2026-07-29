import type { OpenImageTrailDbResult } from '../data/db.js';

type OpenDb = () => Promise<OpenImageTrailDbResult>;

export function createRetryingDbProvider(openDb: OpenDb): () => Promise<IDBDatabase | null> {
  let dbPromise: Promise<IDBDatabase | null> | null = null;

  return () => {
    if (dbPromise) return dbPromise;

    const attempt: Promise<IDBDatabase | null> = Promise.resolve()
      .then(openDb)
      .then((result) => {
        const db = result.status.ok ? result.db : null;
        if (db) {
          db.onversionchange = () => {
            db.close();
            if (dbPromise === attempt) dbPromise = null;
          };
        }
        return db;
      });
    dbPromise = attempt;

    void attempt.then(
      (db) => {
        if (!db && dbPromise === attempt) dbPromise = null;
      },
      () => {
        if (dbPromise === attempt) dbPromise = null;
      },
    );

    return attempt;
  };
}
