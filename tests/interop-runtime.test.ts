import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import * as v from 'valibot';

import { InteropRuntime, type InteropRuntimeDependencies } from '../extension/src/background/interop-runtime.js';
import {
  createInteropRuntimeMessage,
  createInteropRuntimeResultMessage,
  isInteropRuntimeResultMessage,
} from '../extension/src/background/interop-runtime-messages.js';
import { interopRuntimeRequestSchema } from '../extension/src/background/message-schemas.js';
import { openImageTrailDb } from '../extension/src/data/db.js';

const context = { entry: 'selection' as const, total: 3, locked: false };

async function harness() {
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
    probeGoogleDrive: async (interactive) => {
      probes.push(interactive);
    },
    disconnectGoogleDrive: async () => undefined,
    probeICloud: async () => {
      throw new Error('Signed Overlook iCloud host is missing.');
    },
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

test('provider choice is durable and connection probes never reuse backup custody', async (t) => {
  const { runtime, db, probes } = await harness();
  t.after(() => db.close());
  const initial = await runtime.dispatch(context, { name: 'status' });
  assert.equal(initial.snapshot.provider.id, 'pcloud');
  assert.equal(initial.snapshot.provider.state, 'unavailable');
  assert.match(initial.snapshot.provider.detail, /Separate pCloud interoperability access/u);
  const selected = await runtime.dispatch(context, { name: 'select-provider', provider: 'google-drive' });
  assert.equal(selected.snapshot.provider.state, 'connected');
  assert.deepEqual(probes, [false]);
  await runtime.dispatch(context, { name: 'connect' });
  assert.deepEqual(probes, [false, true]);
  const restored = await runtime.dispatch(context, { name: 'status' });
  assert.equal(restored.snapshot.provider.id, 'google-drive');
});

test('pairing import stores non-extractable custody while start fails without claiming transfer', async (t) => {
  const { runtime, db } = await harness();
  t.after(() => db.close());
  await runtime.dispatch(context, { name: 'select-provider', provider: 'google-drive' });
  const bundle = readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8');
  const paired = await runtime.dispatch(context, { name: 'import-pairing', fileContent: bundle, password: 'fixture-password' });
  assert.equal(paired.snapshot.pairing, 'paired');
  assert.equal(paired.ok, true);
  const started = await runtime.dispatch(context, { name: 'start' });
  assert.equal(started.ok, false);
  assert.equal(started.snapshot.error?.code, 'unsupported-record');
  assert.equal(started.snapshot.processed, 0);
  assert.equal(started.snapshot.counts.finalized, 0);
});

test('locked workspaces never start or expose provider setup through a successful result', async (t) => {
  const { runtime, db } = await harness();
  t.after(() => db.close());
  const result = await runtime.dispatch({ ...context, locked: true }, { name: 'start' });
  assert.equal(result.ok, false);
  assert.equal(result.snapshot.locked, true);
  assert.equal(result.snapshot.error?.code, 'wrong-key');
});
