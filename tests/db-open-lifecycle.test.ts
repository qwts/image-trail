import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetryingDbProvider } from '../extension/src/background/db-provider.js';
import { openImageTrailDb, type OpenImageTrailDbResult } from '../extension/src/data/db.js';

const FAILED_OPEN: OpenImageTrailDbResult = {
  db: null,
  status: { ok: false, code: 'db-open-failed', message: 'Database unavailable.' },
};

function successfulOpen(db: IDBDatabase): OpenImageTrailDbResult {
  return { db, status: { ok: true, code: 'ok', message: 'Database opened.' } };
}

test('retrying database provider deduplicates concurrent opens and retries a failed result', async () => {
  const db = {} as IDBDatabase;
  let resolveFirst!: (result: OpenImageTrailDbResult) => void;
  let openCount = 0;
  const firstOpen = new Promise<OpenImageTrailDbResult>((resolve) => {
    resolveFirst = resolve;
  });
  const getDb = createRetryingDbProvider(async () => {
    openCount += 1;
    return openCount === 1 ? firstOpen : successfulOpen(db);
  });

  const first = getDb();
  const concurrent = getDb();
  assert.strictEqual(concurrent, first);
  assert.equal(openCount, 0);

  resolveFirst(FAILED_OPEN);
  assert.equal(await first, null);
  assert.equal(await getDb(), db);
  assert.equal(await getDb(), db);
  assert.equal(openCount, 2);
});

test('retrying database provider clears a rejected attempt', async () => {
  const db = {} as IDBDatabase;
  let openCount = 0;
  const getDb = createRetryingDbProvider(async () => {
    openCount += 1;
    if (openCount === 1) throw new Error('IndexedDB disabled');
    return successfulOpen(db);
  });

  await assert.rejects(getDb(), /IndexedDB disabled/u);
  assert.equal(await getDb(), db);
  assert.equal(openCount, 2);
});

test('retrying database provider closes and invalidates a cached handle on version change', async () => {
  let closeCount = 0;
  let openCount = 0;
  const firstDb = { close: () => (closeCount += 1) } as unknown as IDBDatabase;
  const secondDb = {} as IDBDatabase;
  const getDb = createRetryingDbProvider(async () => {
    openCount += 1;
    return successfulOpen(openCount === 1 ? firstDb : secondDb);
  });

  assert.equal(await getDb(), firstDb);
  firstDb.onversionchange?.({} as IDBVersionChangeEvent);
  assert.equal(closeCount, 1);
  assert.equal(await getDb(), secondDb);
  assert.equal(openCount, 2);
});

test('openImageTrailDb closes a live handle when another context requests a version change', async () => {
  let closeCount = 0;
  const db = { close: () => (closeCount += 1) } as unknown as IDBDatabase;
  const request = { result: db, transaction: null, error: null } as unknown as IDBOpenDBRequest;
  const indexedDb = { open: () => request } as unknown as IDBFactory;

  const resultPromise = openImageTrailDb(indexedDb);
  request.onsuccess?.({} as Event);
  assert.equal((await resultPromise).db, db);
  db.onversionchange?.({} as IDBVersionChangeEvent);
  assert.equal(closeCount, 1);
});

test('openImageTrailDb closes a success handle that arrives after a blocked result', async () => {
  let closeCount = 0;
  const db = { close: () => (closeCount += 1) } as unknown as IDBDatabase;
  const request = { result: db, transaction: null, error: null } as unknown as IDBOpenDBRequest;
  const indexedDb = { open: () => request } as unknown as IDBFactory;

  const resultPromise = openImageTrailDb(indexedDb);
  request.onblocked?.({} as IDBVersionChangeEvent);

  assert.deepEqual(await resultPromise, {
    db: null,
    status: { ok: false, code: 'db-open-failed', message: 'Image Trail storage open was blocked by another context.' },
  });

  request.onsuccess?.({} as Event);
  assert.equal(closeCount, 1);
});
