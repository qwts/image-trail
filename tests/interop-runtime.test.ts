import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import * as v from 'valibot';

import { ensurePCloudInteropHostPermission, hasConfiguredDriveOAuth } from '../extension/src/background/interop-runtime-chrome.js';
import { InteropRuntime, type InteropRuntimeDependencies } from '../extension/src/background/interop-runtime.js';
import { InteropTransportError, sha256, type InteropObjectPage, type InteropObjectStore } from '../extension/src/core/interop/transport.js';
import {
  createInteropRuntimeMessage,
  createInteropRuntimeResultMessage,
  isInteropRuntimeResultMessage,
} from '../extension/src/background/interop-runtime-messages.js';
import { interopRuntimeRequestSchema } from '../extension/src/background/message-schemas.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { ensureDurableBookmarkKey } from '../extension/src/data/durable-bookmark-key.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';

const context = { entry: 'selection' as const, total: 3, recordIds: ['bookmark-1', 'bookmark-2', 'bookmark-3'], locked: false };

class MemoryStore implements InteropObjectStore {
  readonly provider = 'google-drive' as const;
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
    return bytes ? Promise.resolve(bytes.slice()) : Promise.reject(new InteropTransportError('missing', 'not-found', false));
  }
  list(_prefix: string, _cursor: string | null): Promise<InteropObjectPage> {
    return Promise.resolve({ entries: [], nextCursor: null });
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

async function harness(overrides: Partial<InteropRuntimeDependencies> = {}) {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  let value: unknown;
  const probes: boolean[] = [];
  const dependencies: InteropRuntimeDependencies = {
    storage: {
      get: async () => ({ interopRuntimePreferences: value }),
      set: async (items) => {
        value = items['interopRuntimePreferences'];
      },
    },
    getDb: async () => opened.db,
    getActiveBlobKey: async () => null,
    probePCloud: async () => false,
    disconnectPCloud: async () => undefined,
    probeGoogleDrive: async (interactive) => {
      probes.push(interactive);
    },
    disconnectGoogleDrive: async () => undefined,
    probeICloud: async () => {
      throw new Error('Signed Overlook iCloud host is missing.');
    },
    openProvider: async () => null,
    ...overrides,
  };
  return { runtime: new InteropRuntime(dependencies), db: opened.db, probes };
}

test('runtime messages and request schema accept the typed provider boundary', () => {
  const message = createInteropRuntimeMessage(context, { name: 'select-provider', provider: 'google-drive' });
  assert.equal(v.safeParse(interopRuntimeRequestSchema, message.payload).success, true);
  assert.equal(
    v.safeParse(interopRuntimeRequestSchema, { ...message.payload, action: { name: 'select-provider', provider: 'backup-token' } }).success,
    false,
  );
  const result = createInteropRuntimeResultMessage({
    ok: false,
    snapshot: {
      entry: 'selection',
      operation: 'move',
      target: 'overlook',
      provider: { id: 'pcloud', label: 'pCloud', state: 'unavailable', detail: 'Separate authority required.' },
      pairing: 'unpaired',
      phase: 'queued',
      counts: {
        total: 3,
        eligible: 0,
        duplicate: 0,
        conflict: 0,
        metadataOnly: 0,
        unsupported: 0,
        skipped: 0,
        failed: 0,
        acknowledged: 0,
        finalized: 0,
      },
      processed: 0,
      conflicts: [],
      error: null,
      locked: false,
    },
  });
  assert.equal(isInteropRuntimeResultMessage(result), true);
});

test('Google Drive is enabled only for a non-empty drive.file OAuth manifest', () => {
  assert.equal(hasConfiguredDriveOAuth({}), false);
  assert.equal(hasConfiguredDriveOAuth({ oauth2: { client_id: '', scopes: ['https://www.googleapis.com/auth/drive.file'] } }), false);
  assert.equal(hasConfiguredDriveOAuth({ oauth2: { client_id: 'client-id', scopes: ['openid'] } }), false);
  assert.equal(
    hasConfiguredDriveOAuth({
      oauth2: { client_id: 'client-id', scopes: ['https://www.googleapis.com/auth/drive.file'] },
    }),
    true,
  );
});

test('pCloud requests its optional host permission only for an interactive connection', async () => {
  const requested: string[] = [];
  const request = async (pattern: string): Promise<boolean> => {
    requested.push(pattern);
    return false;
  };
  await ensurePCloudInteropHostPermission(false, request);
  assert.deepEqual(requested, []);
  await assert.rejects(
    ensurePCloudInteropHostPermission(true, request),
    (error: unknown) => error instanceof InteropTransportError && error.code === 'provider-unavailable',
  );
  assert.deepEqual(requested, ['https://*.pcloud.com/*']);
});

test('provider choice is durable and connection probes never reuse backup custody', async (t) => {
  const { runtime, db, probes } = await harness();
  t.after(() => db.close());
  const initial = await runtime.dispatch(context, { name: 'status' });
  assert.equal(initial.snapshot.provider.id, 'pcloud');
  assert.equal(initial.snapshot.provider.state, 'disconnected');
  assert.match(initial.snapshot.provider.detail, /Separate pCloud interoperability access/u);
  const selected = await runtime.dispatch(context, { name: 'select-provider', provider: 'google-drive' });
  assert.equal(selected.snapshot.provider.state, 'connected');
  assert.deepEqual(probes, [false]);
  await runtime.dispatch(context, { name: 'connect' });
  assert.deepEqual(probes, [false, true]);
  const restored = await runtime.dispatch(context, { name: 'status' });
  assert.equal(restored.snapshot.provider.id, 'google-drive');
});

test('pCloud connect and disconnect use isolated interop custody', async (t) => {
  let connected = false;
  const pcloudProbes: boolean[] = [];
  let disconnects = 0;
  const { runtime, db } = await harness({
    probePCloud: async (interactive) => {
      pcloudProbes.push(interactive);
      if (interactive) connected = true;
      return connected;
    },
    disconnectPCloud: async () => {
      connected = false;
      disconnects += 1;
    },
  });
  t.after(() => db.close());
  const initial = await runtime.dispatch(context, { name: 'status' });
  assert.equal(initial.snapshot.provider.state, 'disconnected');
  const connectedResult = await runtime.dispatch(context, { name: 'connect' });
  assert.equal(connectedResult.snapshot.provider.state, 'connected');
  assert.deepEqual(pcloudProbes, [false, true]);
  const disconnected = await runtime.dispatch(context, { name: 'disconnect' });
  assert.equal(disconnected.snapshot.provider.state, 'disconnected');
  assert.equal(disconnects, 1);
});

test('an unconfigured Google OAuth client keeps Drive unavailable without claiming connection', async (t) => {
  const { runtime, db } = await harness({
    probeGoogleDrive: async () => {
      throw new InteropTransportError(
        'Google Drive interoperability requires a configured extension OAuth client.',
        'provider-unavailable',
        false,
      );
    },
  });
  t.after(() => db.close());
  const result = await runtime.dispatch(context, { name: 'select-provider', provider: 'google-drive' });
  assert.equal(result.ok, false);
  assert.equal(result.snapshot.provider.state, 'unavailable');
  assert.match(result.snapshot.provider.detail, /configured extension OAuth client/u);
});

test('pairing import stores non-extractable custody while unavailable publication fails without claiming transfer', async (t) => {
  const { runtime, db } = await harness();
  t.after(() => db.close());
  await runtime.dispatch(context, { name: 'select-provider', provider: 'google-drive' });
  const bundle = readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8');
  const paired = await runtime.dispatch(context, { name: 'import-pairing', fileContent: bundle, password: 'fixture-password' });
  assert.equal(paired.snapshot.pairing, 'paired');
  assert.equal(paired.ok, true);
  const started = await runtime.dispatch(context, { name: 'start' });
  assert.equal(started.ok, false);
  assert.equal(started.snapshot.error?.code, 'provider-unavailable');
  assert.equal(started.snapshot.processed, 0);
  assert.equal(started.snapshot.counts.finalized, 0);
});

test('runtime start publishes the exact reviewed selection and reloads durable Move progress', async (t) => {
  const store = new MemoryStore();
  const { runtime, db } = await harness({ openProvider: async () => store });
  t.after(() => db.close());
  const key = await ensureDurableBookmarkKey(new KeysRepository(db));
  await new BookmarksRepository(db).sealAndPut(
    'bookmark-1',
    { url: 'https://example.test/one.jpg', title: 'One', bookmarkedAt: '2026-07-17T12:00:00.000Z' },
    key.key,
    key.reference,
    '2026-07-17T12:00:00.000Z',
  );
  const selectedContext = { entry: 'bookmark' as const, total: 1, recordIds: ['bookmark-1'], locked: false };
  await runtime.dispatch(selectedContext, { name: 'select-provider', provider: 'google-drive' });
  const bundle = readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8');
  await runtime.dispatch(selectedContext, { name: 'import-pairing', fileContent: bundle, password: 'fixture-password' });
  const started = await runtime.dispatch(selectedContext, { name: 'start' });
  assert.equal(started.ok, true);
  assert.equal(started.snapshot.phase, 'awaiting-acknowledgement');
  assert.equal(started.snapshot.counts.eligible, 1);
  assert.equal(started.snapshot.processed, 1);
  assert.ok(store.objects.size > 0);
  const restored = await runtime.dispatch(selectedContext, { name: 'status' });
  assert.equal(restored.snapshot.phase, 'awaiting-acknowledgement');
  assert.equal(restored.snapshot.processed, 1);
});

test('locked workspaces never start or expose provider setup through a successful result', async (t) => {
  const { runtime, db } = await harness();
  t.after(() => db.close());
  const result = await runtime.dispatch({ ...context, locked: true }, { name: 'start' });
  assert.equal(result.ok, false);
  assert.equal(result.snapshot.locked, true);
  assert.equal(result.snapshot.error?.code, 'wrong-key');
});
