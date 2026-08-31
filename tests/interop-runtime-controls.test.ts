import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

import { InteropRuntime, type InteropRuntimeDependencies } from '../extension/src/background/interop-runtime.js';
import { sha256, type InteropObjectPage, type InteropObjectStore } from '../extension/src/core/interop/transport.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { ensureDurableBookmarkKey } from '../extension/src/data/durable-bookmark-key.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';

class MemoryStore implements InteropObjectStore {
  readonly provider = 'local-overlook' as const;
  readonly objects = new Map<string, Uint8Array>();

  authState(): Promise<'connected'> {
    return Promise.resolve('connected');
  }
  put(path: string, bytes: Uint8Array): Promise<{ readonly bytes: number }> {
    this.objects.set(path, bytes.slice());
    return Promise.resolve({ bytes: bytes.byteLength });
  }
  get(path: string): Promise<Uint8Array> {
    const bytes = this.objects.get(path);
    return bytes ? Promise.resolve(bytes.slice()) : Promise.reject(new Error('missing'));
  }
  list(prefix: string): Promise<InteropObjectPage> {
    return Promise.resolve({
      entries: [...this.objects.entries()]
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, bytes]) => ({ path, bytes: bytes.byteLength })),
      nextCursor: null,
    });
  }
  delete(path: string): Promise<void> {
    this.objects.delete(path);
    return Promise.resolve();
  }
  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number }> {
    return Promise.resolve({ usedBytes: 0, totalBytes: 1_000_000 });
  }
  async verify(path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    const bytes = await this.get(path);
    return { sha256: await sha256(bytes), bytes: bytes.byteLength };
  }
}

test('only the exact reviewed selection can cancel an active local Move journal', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  const db = opened.db;
  t.after(() => db.close());
  let stored: unknown;
  const cancelled: string[] = [];
  const store = new MemoryStore();
  const dependencies: InteropRuntimeDependencies = {
    storage: {
      get: async () => ({ interopRuntimePreferences: stored }),
      set: async (items) => {
        stored = items['interopRuntimePreferences'];
      },
    },
    getDb: async () => db,
    getActiveBlobKey: async () => null,
    probePCloud: async () => false,
    disconnectPCloud: async () => undefined,
    probeGoogleDrive: async () => undefined,
    disconnectGoogleDrive: async () => undefined,
    probeICloud: async () => 'connected',
    disconnectICloud: async () => undefined,
    cancelICloudOperation: async (operationId) => {
      cancelled.push(operationId);
    },
    openProvider: async () => store,
    finalizeSourceRecord: async () => undefined,
  };
  const runtime = new InteropRuntime(dependencies);
  const key = await ensureDurableBookmarkKey(new KeysRepository(db));
  await new BookmarksRepository(db).sealAndPut(
    'bookmark-1',
    { url: 'https://example.test/one.jpg', title: 'One', bookmarkedAt: '2026-08-31T00:00:00.000Z' },
    key.key,
    key.reference,
    '2026-08-31T00:00:00.000Z',
  );
  const selected = { entry: 'bookmark' as const, total: 1, recordIds: ['bookmark-1'], locked: false };
  await runtime.dispatch(selected, {
    name: 'import-pairing',
    fileContent: readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8'),
    password: 'fixture-password',
  });
  const started = await runtime.dispatch(selected, { name: 'start' });
  assert.equal(started.snapshot.active, true);
  const activeId = (stored as { activeTransferId?: string }).activeTransferId;
  assert.ok(activeId);

  const other = { ...selected, recordIds: ['bookmark-2'] };
  const mismatched = await runtime.dispatch(other, { name: 'status' });
  assert.equal(mismatched.snapshot.active, false);
  const rejected = await runtime.dispatch(other, { name: 'cancel' });
  assert.equal(rejected.ok, false);
  assert.match(rejected.snapshot.error?.message ?? '', /does not own the active journal/u);
  assert.equal((stored as { activeTransferId?: string }).activeTransferId, activeId);
  assert.deepEqual(cancelled, []);

  const result = await runtime.dispatch(selected, { name: 'cancel' });
  assert.equal(result.snapshot.phase, 'cancelled');
  assert.equal(result.snapshot.active, false);
  assert.deepEqual(cancelled, [activeId]);
  assert.equal((stored as { activeTransferId?: string }).activeTransferId, undefined);
});
