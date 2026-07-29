import type { OpenImageTrailDbResult } from '../data/db.js';

type OpenDb = () => Promise<OpenImageTrailDbResult>;

export function createRetryingDbProvider(openDb: OpenDb): () => Promise<IDBDatabase | null> {
  let dbPromise: Promise<IDBDatabase | null> | null = null;

  return () => {
    if (dbPromise) return dbPromise;

    const attempt = Promise.resolve()
      .then(openDb)
      .then((result) => (result.status.ok ? result.db : null));
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
