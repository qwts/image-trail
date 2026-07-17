import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import * as v from 'valibot';

import {
  ensurePCloudInteropHostPermission,
  hasConfiguredDriveOAuth,
  preflightChromeInteropAction,
} from '../extension/src/background/interop-runtime-chrome.js';
import { InteropRuntime, type InteropRuntimeDependencies } from '../extension/src/background/interop-runtime.js';
import {
  EncryptedInteropTransport,
  InteropTransportError,
  sha256,
  type InteropObjectPage,
  type InteropObjectStore,
} from '../extension/src/core/interop/transport.js';
import { parseInteropEnvelope } from '../extension/src/core/interop/messages.js';
import {
  createInteropRuntimeMessage,
  createInteropRuntimeResultMessage,
  isInteropRuntimeResultMessage,
} from '../extension/src/background/interop-runtime-messages.js';
import { interopRuntimeRequestSchema } from '../extension/src/background/message-schemas.js';
import { createInteropRuntimeMessageRegistry } from '../extension/src/background/handlers/interop-runtime-handlers.js';
import { dispatchRequest } from '../extension/src/background/message-dispatch.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { ensureDurableBookmarkKey } from '../extension/src/data/durable-bookmark-key.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';
import { InteropKeysRepository } from '../extension/src/data/repositories/interop-keys-repository.js';
import { SecureMoveOutboxRepository } from '../extension/src/data/interop/secure-move-outbox-repository.js';
import { isMoveRecordEnvelope } from '../extension/src/data/interop/move-journal-records.js';
import { openInteropMessage, sealInteropMessage } from '../extension/src/data/interop/sealed-message.js';
import { moveAcknowledgementPath } from '../extension/src/data/interop/move-acknowledgement-reconciler.js';
import { parseSyncMessagePath, syncMessagePath } from '../extension/src/data/interop/sync-paths.js';

const context = { entry: 'selection' as const, total: 3, recordIds: ['bookmark-1', 'bookmark-2', 'bookmark-3'], locked: false };

test('Sync message paths bind a positive sequence and canonical message id', () => {
  const messageId = '36931c95-5e91-4cb3-9400-7fbe18245785';
  assert.deepEqual(parseSyncMessagePath(syncMessagePath(12, messageId)), { sequence: 12, messageId });
  assert.throws(() => parseSyncMessagePath(`messages/outbox/000000000000-${messageId}.json.aesgcm`), /positive/u);
  assert.throws(() => syncMessagePath(0, messageId), /outside/u);
});

class MemoryStore implements InteropObjectStore {
  readonly provider = 'google-drive' as const;
  readonly objects = new Map<string, Uint8Array>();
  failPuts = 0;

  authState(): Promise<'connected'> {
    return Promise.resolve('connected');
  }
  put(path: string, bytes: Uint8Array): Promise<{ readonly bytes: number }> {
    if (this.failPuts > 0) {
      this.failPuts -= 1;
      return Promise.reject(new InteropTransportError('Temporary provider failure.', 'provider-unavailable', true));
    }
    this.objects.set(path, bytes.slice());
    return Promise.resolve({ bytes: bytes.byteLength });
  }
  get(path: string): Promise<Uint8Array> {
    const bytes = this.objects.get(path);
    return bytes ? Promise.resolve(bytes.slice()) : Promise.reject(new InteropTransportError('missing', 'not-found', false));
  }
  list(prefix: string, _cursor: string | null): Promise<InteropObjectPage> {
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
    finalizeSourceRecord: async () => undefined,
    ...overrides,
  };
  return { runtime: new InteropRuntime(dependencies), db: opened.db, probes, getStored: () => value };
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
  assert.equal(v.safeParse(interopRuntimeRequestSchema, { context, action: { name: 'connect' } }).success, false);
});

test('provider permission preflight starts in the synchronous message-listener stack', async (t) => {
  const { runtime, db } = await harness();
  t.after(() => db.close());
  let preflightStarted = false;
  let respond!: () => void;
  const response = new Promise<void>((resolve) => {
    respond = resolve;
  });
  const registry = createInteropRuntimeMessageRegistry(runtime, () => {
    preflightStarted = true;
    return Promise.resolve();
  });
  const dispatched = dispatchRequest(registry, createInteropRuntimeMessage(context, { name: 'connect', provider: 'pcloud' }), () =>
    respond(),
  );
  assert.equal(dispatched, true);
  assert.equal(preflightStarted, true);
  await response;
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
  requested.length = 0;
  await preflightChromeInteropAction({ name: 'connect', provider: 'google-drive' }, request);
  assert.deepEqual(requested, []);
  await assert.rejects(preflightChromeInteropAction({ name: 'connect', provider: 'pcloud' }, request));
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
  await runtime.dispatch(context, { name: 'connect', provider: 'google-drive' });
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
  const connectedResult = await runtime.dispatch(context, { name: 'connect', provider: 'pcloud' });
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
  const finalized: string[] = [];
  const { runtime, db, getStored } = await harness({
    openProvider: async () => store,
    finalizeSourceRecord: async (sourceLocalId) => {
      finalized.push(sourceLocalId);
    },
  });
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
  const pairing = (await new InteropKeysRepository(db).list())[0];
  assert.ok(pairing);
  const transferId = (getStored() as { activeTransferId?: string }).activeTransferId;
  assert.ok(transferId);
  const outbox = (await new SecureMoveOutboxRepository(db).outbox(transferId))[0];
  assert.ok(outbox);
  const source = await openInteropMessage(new Uint8Array(outbox.ciphertext.slice(0)), pairing);
  assert.equal(isMoveRecordEnvelope(source), true);
  if (!isMoveRecordEnvelope(source)) throw new Error('Expected a Move record envelope.');
  const acknowledgement = parseInteropEnvelope({
    header: {
      ...source.header,
      messageId: '77777777-7777-4777-8777-777777777777',
      sourceProduct: 'overlook',
      targetProduct: 'image-trail',
      kind: 'acknowledgement',
      createdAt: '2026-07-17T12:05:00.000Z',
    },
    payload: {
      kind: 'acknowledgement',
      schemaVersion: 1,
      status: 'accepted',
      recordInteropId: source.payload.record.identity.interopId,
      targetLocalId: 'overlook-1',
      metadataPersisted: true,
      originalVerification: 'unavailable',
      acknowledgedMessageIds: [source.header.messageId],
      errors: [],
    },
  });
  const sealed = await sealInteropMessage(acknowledgement, pairing);
  await new EncryptedInteropTransport(store).upload(
    { pairingId: pairing.pairingId, transferId },
    moveAcknowledgementPath(acknowledgement.header.sequence, acknowledgement.header.messageId),
    sealed,
  );
  sealed.fill(0);
  const completed = await runtime.dispatch(selectedContext, { name: 'status' });
  assert.equal(completed.snapshot.phase, 'completed');
  assert.equal(completed.snapshot.counts.acknowledged, 1);
  assert.equal(completed.snapshot.counts.finalized, 1);
  assert.deepEqual(finalized, ['bookmark-1']);
});

test('runtime Sync publishes a pairing-key-sealed selected snapshot without plaintext journal metadata', async (t) => {
  const store = new MemoryStore();
  const { runtime, db, getStored } = await harness({ openProvider: async () => store });
  t.after(() => db.close());
  const key = await ensureDurableBookmarkKey(new KeysRepository(db));
  await new BookmarksRepository(db).sealAndPut(
    'bookmark-1',
    { url: 'https://private.example.test/sync.jpg', title: 'Private Sync title', bookmarkedAt: '2026-07-17T12:00:00.000Z' },
    key.key,
    key.reference,
    '2026-07-17T12:00:00.000Z',
  );
  const queueUpdatedAt = (await new BookmarksRepository(db).getEncrypted('bookmark-1'))?.queueUpdatedAt;
  const selected = { entry: 'bookmark' as const, total: 1, recordIds: ['bookmark-1'], locked: false };
  await runtime.dispatch(selected, { name: 'select-provider', provider: 'google-drive' });
  await runtime.dispatch(selected, {
    name: 'import-pairing',
    fileContent: readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8'),
    password: 'fixture-password',
  });
  const moved = await runtime.dispatch(selected, { name: 'start' });
  assert.equal(moved.snapshot.phase, 'awaiting-acknowledgement');
  const moveTransferId = (getStored() as { activeTransferId?: string }).activeTransferId;
  assert.ok(moveTransferId);
  await runtime.dispatch(selected, { name: 'set-operation', operation: 'sync' });
  store.failPuts = 1;
  const started = await runtime.dispatch(selected, { name: 'start' });
  assert.equal(started.ok, false);
  assert.equal(started.snapshot.operation, 'sync');
  assert.equal(started.snapshot.phase, 'failed');
  assert.equal(started.snapshot.error?.code, 'partial-failure');
  assert.equal(started.snapshot.processed, 0);
  assert.equal(started.snapshot.counts.eligible, 1);
  const preferences = getStored() as { activeTransferId?: string; activeSyncSessionId?: string };
  assert.equal(preferences.activeTransferId, moveTransferId);
  const sessionId = preferences.activeSyncSessionId;
  assert.ok(sessionId);
  const transaction = db.transaction(['secureSyncItems', 'secureSyncOutbox'], 'readonly');
  const itemRequest = transaction.objectStore('secureSyncItems').getAll();
  const outboxRequest = transaction.objectStore('secureSyncOutbox').getAll();
  const result = (request: IDBRequest<unknown[]>): Promise<unknown[]> =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const [items, outbox] = await Promise.all([result(itemRequest), result(outboxRequest)]);
  assert.doesNotMatch(JSON.stringify({ items, outbox }), /Private Sync title|private\.example\.test|sync\.jpg/u);
  const row = outbox[0] as { ciphertext?: ArrayBuffer } | undefined;
  assert.ok(row?.ciphertext);
  const pairing = (await new InteropKeysRepository(db).list())[0];
  assert.ok(pairing);
  const envelope = await openInteropMessage(new Uint8Array(row.ciphertext), pairing);
  assert.equal(envelope.header.operation, 'sync');
  assert.equal(envelope.payload.kind === 'record' ? envelope.payload.record.title : null, 'Private Sync title');
  const restored = await runtime.dispatch(selected, { name: 'status' });
  assert.equal(restored.snapshot.phase, 'failed');
  assert.equal(restored.snapshot.error?.code, 'interrupted');
  const resumedAfterFailure = await runtime.dispatch(selected, { name: 'resume' });
  assert.equal(resumedAfterFailure.snapshot.phase, 'reviewing');
  assert.equal(resumedAfterFailure.snapshot.processed, 1);
  assert.equal(envelope.payload.kind, 'record');
  if (envelope.payload.kind !== 'record') throw new Error('Expected a Sync record envelope.');
  const remoteMessageId = crypto.randomUUID();
  const remote = parseInteropEnvelope({
    header: {
      ...envelope.header,
      messageId: remoteMessageId,
      sourceProduct: 'overlook',
      targetProduct: 'image-trail',
      sequence: 2,
    },
    payload: {
      ...envelope.payload,
      record: {
        ...envelope.payload.record,
        title: 'Private Overlook title',
        revision: { imageTrail: 1, overlook: 1 },
        fieldRevisions: { ...envelope.payload.record.fieldRevisions, title: { imageTrail: 0, overlook: 1 } },
      },
    },
  });
  const remoteCiphertext = await sealInteropMessage(remote, pairing);
  await new EncryptedInteropTransport(store).upload(
    { pairingId: pairing.pairingId, transferId: sessionId },
    syncMessagePath(2, remoteMessageId),
    remoteCiphertext,
  );
  remoteCiphertext.fill(0);
  const reviewed = await runtime.dispatch(selected, { name: 'status' });
  assert.equal(reviewed.snapshot.counts.eligible, 0);
  assert.equal(reviewed.snapshot.counts.conflict, 1);
  assert.deepEqual(reviewed.snapshot.conflicts, [
    { interopId: envelope.payload.record.identity.interopId, label: 'Sync record', fields: ['title'] },
  ]);
  assert.equal((await new BookmarksRepository(db).getEncrypted('bookmark-1'))?.queueUpdatedAt, queueUpdatedAt);
  const inboxTransaction = db.transaction('secureSyncInbox', 'readonly');
  const inbox = await result(inboxTransaction.objectStore('secureSyncInbox').getAll());
  assert.doesNotMatch(JSON.stringify(inbox), /Private Overlook title|private\.example\.test|sync\.jpg/u);
  const inboxRow = inbox[0] as { ciphertext?: ArrayBuffer } | undefined;
  assert.ok(inboxRow?.ciphertext);
  const openedRemote = await openInteropMessage(new Uint8Array(inboxRow.ciphertext), pairing);
  assert.equal(openedRemote.payload.kind === 'record' ? openedRemote.payload.record.title : null, 'Private Overlook title');
  assert.equal((await runtime.dispatch(selected, { name: 'status' })).snapshot.counts.conflict, 1);
  assert.equal((await runtime.dispatch({ ...selected, locked: true }, { name: 'status' })).snapshot.conflicts.length, 0);
  const paused = await runtime.dispatch(selected, { name: 'pause' });
  assert.equal(paused.snapshot.phase, 'paused');
  const resumed = await runtime.dispatch(selected, { name: 'resume' });
  assert.equal(resumed.snapshot.phase, 'reviewing');
  assert.equal(resumed.snapshot.processed, 1);
  const cancelled = await runtime.dispatch(selected, { name: 'cancel' });
  assert.equal(cancelled.snapshot.phase, 'cancelled');
  const afterCancel = getStored() as { activeTransferId?: string; activeSyncSessionId?: string };
  assert.equal(afterCancel.activeTransferId, moveTransferId);
  assert.equal(afterCancel.activeSyncSessionId, undefined);
  const statusAfterCancel = await runtime.dispatch(selected, { name: 'status' });
  assert.equal(statusAfterCancel.snapshot.phase, 'queued');
  const restarted = await runtime.dispatch(selected, { name: 'start' });
  assert.equal(restarted.snapshot.phase, 'reviewing');
});

test('locked workspaces never start or expose provider setup through a successful result', async (t) => {
  const { runtime, db } = await harness();
  t.after(() => db.close());
  const result = await runtime.dispatch({ ...context, locked: true }, { name: 'start' });
  assert.equal(result.ok, false);
  assert.equal(result.snapshot.locked, true);
  assert.equal(result.snapshot.error?.code, 'wrong-key');
});
