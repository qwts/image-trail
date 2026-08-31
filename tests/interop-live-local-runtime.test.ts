import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

import {
  LiveLocalInteropRuntime,
  type LiveLocalRuntimeClient,
  type LiveLocalRuntimeSession,
} from '../extension/src/background/interop-live-local-runtime.js';
import type { LiveLocalConnectInput } from '../extension/src/background/interop-live-local-session.js';
import { InteropTransportError, sha256, type InteropObjectPage, type InteropObjectStore } from '../extension/src/core/interop/transport.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { IndexedDbLiveLocalObjectRepository } from '../extension/src/data/interop/live-local-object-repository.js';

const operationId = '11111111-1111-4111-8111-111111111111';
const otherOperationId = '22222222-2222-4222-8222-222222222222';

test('live local ciphertext staging is durable, verified, isolated, and clearable by operation', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  const repository = new IndexedDbLiveLocalObjectRepository(opened.db, operationId);
  const other = new IndexedDbLiveLocalObjectRepository(opened.db, otherOperationId);
  const bytes = new TextEncoder().encode('sealed-ciphertext');
  const digest = await sha256(bytes);

  await repository.put('pairings/a/objects/message.bin', bytes, digest);
  await repository.put('pairings/a/objects/message.bin', bytes, digest);
  await other.put('pairings/b/objects/message.bin', bytes, digest);
  assert.deepEqual(await repository.get('pairings/a/objects/message.bin'), bytes);
  assert.deepEqual(await repository.verify('pairings/a/objects/message.bin'), { sha256: digest, bytes: bytes.byteLength });
  assert.deepEqual(await repository.list('pairings/a', null), {
    entries: [{ path: 'pairings/a/objects/message.bin', bytes: bytes.byteLength }],
    nextCursor: null,
  });
  assert.deepEqual(await repository.quota(), { usedBytes: bytes.byteLength, totalBytes: null });

  const changed = new TextEncoder().encode('different-ciphertext');
  await assert.rejects(
    repository.put('pairings/a/objects/message.bin', changed, await sha256(changed)),
    (error: unknown) => error instanceof InteropTransportError && error.code === 'corrupt' && !error.retryable,
  );
  await repository.clear();
  await assert.rejects(repository.get('pairings/a/objects/message.bin'), /unavailable/u);
  assert.deepEqual(await other.get('pairings/b/objects/message.bin'), bytes);
});

class MemoryStore implements InteropObjectStore {
  readonly provider = 'local-overlook' as const;

  authState(): Promise<'connected'> {
    return Promise.resolve('connected');
  }
  put(_path: string, bytes: Uint8Array): Promise<{ readonly bytes: number }> {
    return Promise.resolve({ bytes: bytes.byteLength });
  }
  get(): Promise<Uint8Array> {
    return Promise.reject(new InteropTransportError('missing', 'not-found', false));
  }
  list(): Promise<InteropObjectPage> {
    return Promise.resolve({ entries: [], nextCursor: null });
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: null }> {
    return Promise.resolve({ usedBytes: 0, totalBytes: null });
  }
  verify(): Promise<{ readonly sha256: string; readonly bytes: number }> {
    return Promise.reject(new InteropTransportError('missing', 'not-found', false));
  }
}

class FakeSession implements LiveLocalRuntimeSession {
  phase = 'connected';
  readonly store = new MemoryStore();
  commits = 0;
  cancels = 0;
  cancelFailures = 0;
  closes = 0;

  commit(): Promise<void> {
    this.commits += 1;
    return Promise.resolve();
  }
  cancel(): void {
    this.cancels += 1;
    if (this.cancelFailures > 0) {
      this.cancelFailures -= 1;
      throw new InteropTransportError('cancel frame failed', 'offline', true);
    }
    this.phase = 'closed';
  }
  close(): void {
    this.closes += 1;
    this.phase = 'closed';
  }
}

class FakeClient implements LiveLocalRuntimeClient {
  readonly inputs: LiveLocalConnectInput[] = [];
  readonly sessions: FakeSession[] = [];

  connect(input: LiveLocalConnectInput): Promise<{ readonly state: 'connected'; readonly session: FakeSession }> {
    this.inputs.push(input);
    const session = new FakeSession();
    this.sessions.push(session);
    return Promise.resolve({ state: 'connected', session });
  }
}

test('live local runtime cancels the matching session and clears operation-scoped staged ciphertext', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  const client = new FakeClient();
  const runtime = new LiveLocalInteropRuntime(() => Promise.resolve(opened.db), client);
  await runtime.open({
    operation: 'move',
    operationId,
    remoteSessionId: otherOperationId,
    pairingId: '33333333-3333-4333-8333-333333333333',
    recordIds: ['bookmark-1'],
  });
  const staged = new IndexedDbLiveLocalObjectRepository(opened.db, operationId);
  const bytes = new TextEncoder().encode('cancelled-ciphertext');
  await staged.put('pairings/a/objects/cancelled.bin', bytes, await sha256(bytes));

  await runtime.cancel(operationId);

  assert.equal(client.sessions[0]?.cancels, 1);
  await assert.rejects(staged.get('pairings/a/objects/cancelled.bin'), /unavailable/u);
});

test('live local runtime retains the session and staged ciphertext until cancellation succeeds', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  const client = new FakeClient();
  const runtime = new LiveLocalInteropRuntime(() => Promise.resolve(opened.db), client);
  await runtime.open({
    operation: 'sync',
    operationId,
    remoteSessionId: otherOperationId,
    pairingId: '33333333-3333-4333-8333-333333333333',
    recordIds: ['bookmark-1'],
  });
  const session = client.sessions[0];
  assert.ok(session);
  session.cancelFailures = 1;
  const staged = new IndexedDbLiveLocalObjectRepository(opened.db, operationId);
  const bytes = new TextEncoder().encode('retry-cancelled-ciphertext');
  await staged.put('pairings/a/objects/retry.bin', bytes, await sha256(bytes));

  await assert.rejects(runtime.cancel(operationId), /cancel frame failed/u);
  assert.equal(session.cancels, 1);
  assert.deepEqual(await staged.get('pairings/a/objects/retry.bin'), bytes);

  await runtime.cancel(operationId);
  assert.equal(session.cancels, 2);
  await assert.rejects(staged.get('pairings/a/objects/retry.bin'), /unavailable/u);
});

test('live local runtime binds exact reviewed identities, reuses only that session, and commits explicitly', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  const client = new FakeClient();
  const runtime = new LiveLocalInteropRuntime(() => Promise.resolve(opened.db), client);
  const move = {
    operation: 'move' as const,
    operationId,
    remoteSessionId: otherOperationId,
    pairingId: '33333333-3333-4333-8333-333333333333',
    recordIds: ['bookmark-1'],
  };

  const first = await runtime.open(move);
  const reused = await runtime.open(move);
  assert.equal(first, reused);
  first.commit?.();
  assert.equal(client.sessions[0]?.commits, 1);
  assert.deepEqual(client.inputs[0]?.review, { operation: 'move' });

  await runtime.open({ ...move, operation: 'sync', recordIds: ['bookmark-1', 'bookmark-2'] });
  assert.equal(client.sessions[0]?.closes, 1);
  assert.deepEqual(client.inputs[1]?.review, {
    operation: 'sync',
    sourceProduct: 'image-trail',
    targetProduct: 'overlook',
    direction: 'two-way',
    scope: { kind: 'selected', localIds: ['bookmark-1', 'bookmark-2'] },
  });
  await runtime.disconnect();
  assert.equal(client.sessions[1]?.closes, 1);
});
