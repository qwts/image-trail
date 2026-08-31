import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

import { InteropRuntime, type InteropRuntimeDependencies } from '../extension/src/background/interop-runtime.js';
import { SecureSyncOutboxRepository } from '../extension/src/data/interop/secure-sync-outbox-repository.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { InteropKeysRepository } from '../extension/src/data/repositories/interop-keys-repository.js';

const context = { entry: 'bookmark' as const, total: 1, recordIds: ['bookmark-1'], locked: true };

async function putPairing(db: IDBDatabase, pairingId: string, updatedAt: string): Promise<void> {
  const uuid = crypto.randomUUID();
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  assert.ok(key instanceof CryptoKey);
  await new InteropKeysRepository(db).put({
    kind: 'interop',
    uuid,
    reference: `interop:${uuid}`,
    pairingId,
    createdAt: updatedAt,
    updatedAt,
    wrapping: { mode: 'indexeddb', algorithm: 'none' },
    extractable: false,
    key,
  });
}

test('local probes use the newest pairing for new work and recover the journal pairing and provider for legacy Sync', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  const db = opened.db;
  t.after(() => db.close());
  const journalPairingId = crypto.randomUUID();
  const newestPairingId = crypto.randomUUID();
  await putPairing(db, journalPairingId, '2026-08-30T12:00:00.000Z');
  await putPairing(db, newestPairingId, '2026-08-30T13:00:00.000Z');

  let stored: unknown;
  const probes: string[] = [];
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
    probeICloud: async (pairingId) => {
      probes.push(pairingId);
      return 'connected';
    },
    disconnectICloud: async () => undefined,
    cancelICloudOperation: async () => undefined,
    openProvider: async () => null,
    finalizeSourceRecord: async () => undefined,
  };
  const runtime = new InteropRuntime(dependencies);
  assert.equal((await runtime.dispatch(context, { name: 'status' })).snapshot.provider.id, 'icloud-drive');
  assert.deepEqual(probes, [newestPairingId]);

  const sessionId = crypto.randomUUID();
  await new SecureSyncOutboxRepository(db).queueBatch({
    sessionId,
    pairingId: journalPairingId,
    provider: 'icloud-drive',
    requested: 1,
    unsupported: 0,
    items: [
      {
        interopId: crypto.randomUUID(),
        sourceLocalId: 'bookmark-1',
        messageId: crypto.randomUUID(),
        sequence: 1,
        path: 'messages/outbox/legacy-sync.json.aesgcm',
        reviewCategory: 'eligible',
        ciphertext: new Uint8Array([1, 2, 3]),
      },
    ],
    at: '2026-08-30T14:00:00.000Z',
  });
  stored = {
    provider: 'pcloud',
    operation: 'sync',
    activeSyncSessionId: sessionId,
    activeSyncRemoteSessionId: crypto.randomUUID(),
    activeSyncRecordIds: ['bookmark-1'],
  };

  const recovered = await runtime.dispatch(context, { name: 'status' });
  assert.equal(recovered.snapshot.provider.id, 'icloud-drive');
  assert.deepEqual(probes, [newestPairingId, journalPairingId]);
  assert.equal((stored as { activeSyncProvider?: string }).activeSyncProvider, 'icloud-drive');
  const routeChange = await runtime.dispatch(context, { name: 'select-provider', provider: 'pcloud' });
  assert.equal(routeChange.ok, false);
  assert.equal(routeChange.snapshot.provider.id, 'icloud-drive');
  assert.match(routeChange.snapshot.error?.message ?? '', /Cancel the active journal/u);
});
