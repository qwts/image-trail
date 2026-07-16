import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { parseInteropEnvelope, type InteropEnvelope } from '../extension/src/core/interop/messages.js';
import type { InteropRecord } from '../extension/src/core/interop/records.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { SyncJournalRepository } from '../extension/src/data/interop/sync-journal-repository.js';
import { SyncProtocolService } from '../extension/src/data/interop/sync-protocol.js';
import { DataStore } from '../extension/src/data/schema.js';
import { openFreshImageTrailDb, requestToPromise, transactionDone } from './indexeddb-test-helpers.js';

const SESSION_ID = '7e3beef1-f319-445d-b5e6-b428e3a8c0c8';
const PAIRING_ID = 'fe6ef9a7-57af-460e-8525-fad45cc79afd';
const MESSAGE_ID = '36931c95-5e91-4cb3-9400-7fbe18245785';

function baseEnvelope(): InteropEnvelope {
  return parseInteropEnvelope(JSON.parse(readFileSync('contracts/interop/v1/fixtures/valid-record-message.json', 'utf8')) as unknown);
}

function clock(): () => string {
  let seconds = 0;
  return () => `2026-07-16T18:30:${String(seconds++).padStart(2, '0')}.000Z`;
}

function syncEnvelope(record: InteropRecord, messageId = MESSAGE_ID): InteropEnvelope {
  const base = baseEnvelope();
  assert.equal(base.payload.kind, 'record');
  return parseInteropEnvelope({
    header: {
      ...base.header,
      messageId,
      transferId: SESSION_ID,
      pairingId: PAIRING_ID,
      sourceProduct: 'overlook',
      targetProduct: 'image-trail',
      operation: 'sync',
      createdAt: '2026-07-16T18:30:00.000Z',
    },
    payload: { ...base.payload, record },
  });
}

async function start(db: IDBDatabase, now = clock()): Promise<{ repository: SyncJournalRepository; service: SyncProtocolService }> {
  const repository = new SyncJournalRepository(db);
  const service = new SyncProtocolService('image-trail', repository, { now });
  await service.start({
    sessionId: SESSION_ID,
    pairingId: PAIRING_ID,
    sourceProduct: 'overlook',
    targetProduct: 'image-trail',
    direction: 'two-way',
    scope: { kind: 'all', localIds: [] },
  });
  return { repository, service };
}

function conflictPair(): { local: InteropRecord; remote: InteropRecord } {
  const envelope = baseEnvelope();
  assert.equal(envelope.payload.kind, 'record');
  const base = envelope.payload.record;
  return {
    local: {
      ...base,
      title: 'Image Trail title',
      revision: { imageTrail: 2, overlook: 0 },
      fieldRevisions: { ...base.fieldRevisions, title: { imageTrail: 2, overlook: 0 } },
    },
    remote: {
      ...base,
      title: 'Overlook title',
      revision: { imageTrail: 1, overlook: 2 },
      fieldRevisions: { ...base.fieldRevisions, title: { imageTrail: 1, overlook: 2 } },
    },
  };
}

test('conflict decisions, receipts, audit, and apply outcomes survive browser restart', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const now = clock();
  const opened = await start(db, now);
  const { local, remote } = conflictPair();
  const envelope = syncEnvelope(remote);
  const received = await opened.service.receive(SESSION_ID, envelope, local);
  assert.equal(received.state, 'conflict');
  assert.equal((await opened.service.decide(SESSION_ID, local.identity.interopId, 'title', 'keep-both', true)).state, 'ready');
  db.close();

  const reopenedResult = await openImageTrailDb();
  assert.equal(reopenedResult.status.ok, true, reopenedResult.status.message);
  assert.ok(reopenedResult.db);
  t.after(() => reopenedResult.db?.close());
  const repository = new SyncJournalRepository(reopenedResult.db);
  const service = new SyncProtocolService('image-trail', repository, { now });
  const persisted = await repository.getItem(SESSION_ID, local.identity.interopId);
  assert.equal(persisted?.decisions.title, 'keep-both');
  assert.equal((await service.receive(SESSION_ID, envelope, local)).state, 'ready');

  let appliedTitle = '';
  let secondaryTitle = '';
  const applied = await service.apply(SESSION_ID, local.identity.interopId, {
    apply: (input) => {
      appliedTitle = input.primary.title ?? '';
      secondaryTitle = input.secondary?.title ?? '';
      return Promise.resolve();
    },
  });
  assert.equal(applied.state, 'applied');
  assert.equal(appliedTitle, 'Image Trail title');
  assert.equal(secondaryTitle, 'Overlook title');
  assert.deepEqual(
    (await repository.audit(SESSION_ID)).map((event) => event.event),
    ['started', 'received', 'decision', 'applied'],
  );
});

test('replay identity is idempotent for exact content and rejects changed content', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const { service } = await start(db);
  const { local, remote } = conflictPair();
  const envelope = syncEnvelope(remote);
  assert.equal((await service.receive(SESSION_ID, envelope, local)).state, 'conflict');
  assert.equal((await service.receive(SESSION_ID, envelope, local)).state, 'conflict');
  const changed = parseInteropEnvelope({ ...envelope, payload: { ...envelope.payload, reviewCategory: 'duplicate' } });
  await assert.rejects(service.receive(SESSION_ID, changed, local), /replayed with different content/u);
});

test('delete review, pause, cancel, and disconnect never silently mutate a library', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const now = clock();
  const { repository, service } = await start(db, now);
  const base = baseEnvelope();
  assert.equal(base.payload.kind, 'record');
  const local = base.payload.record;
  const tombstone: InteropRecord = {
    ...local,
    deletedAt: '2026-07-16T18:20:00.000Z',
    revision: { imageTrail: 1, overlook: 1 },
    fieldRevisions: { ...local.fieldRevisions, deleted: { imageTrail: 1, overlook: 1 } },
  };
  assert.equal((await service.receive(SESSION_ID, syncEnvelope(tombstone), local)).state, 'delete-review');
  await assert.rejects(
    service.apply(SESSION_ID, local.identity.interopId, { apply: () => assert.rejects(Promise.resolve()) }),
    /requires conflict/u,
  );
  assert.equal((await service.reviewDelete(SESSION_ID, local.identity.interopId, 'keep')).state, 'skipped');
  assert.equal((await service.pause(SESSION_ID)).phase, 'paused');
  await assert.rejects(service.apply(SESSION_ID, local.identity.interopId, { apply: () => Promise.resolve() }), /paused/u);
  assert.equal((await service.resume(SESSION_ID)).phase, 'reviewing');
  assert.equal((await service.cancel(SESSION_ID)).phase, 'cancelled');
  await assert.rejects(service.resume(SESSION_ID), /cannot resume/u);
  assert.equal((await service.disconnect(SESSION_ID)).connected, false);
  await assert.rejects(service.resume(SESSION_ID), /cannot resume/u);
  assert.equal((await repository.counts(SESSION_ID)).skipped, 1);

  const transaction = db.transaction([DataStore.Bookmarks, DataStore.History, DataStore.Albums, DataStore.AlbumMemberships], 'readonly');
  const counts = await Promise.all(
    [DataStore.Bookmarks, DataStore.History, DataStore.Albums, DataStore.AlbumMemberships].map((store) =>
      requestToPromise(transaction.objectStore(store).count()),
    ),
  );
  await transactionDone(transaction);
  assert.deepEqual(counts, [0, 0, 0, 0]);
});

test('a concurrent tombstone remains blocked after conflict fields are decided', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const { service } = await start(db);
  const { local, remote } = conflictPair();
  const remoteTombstone: InteropRecord = {
    ...remote,
    deletedAt: '2026-07-16T18:20:00.000Z',
    fieldRevisions: { ...remote.fieldRevisions, deleted: { imageTrail: 1, overlook: 2 } },
  };
  const received = await service.receive(SESSION_ID, syncEnvelope(remoteTombstone), local);
  assert.equal(received.state, 'conflict');
  const decided = await service.decide(SESSION_ID, local.identity.interopId, 'title', 'keep-overlook', true);
  assert.equal(decided.state, 'delete-review');
  await assert.rejects(service.apply(SESSION_ID, local.identity.interopId, { apply: () => Promise.resolve() }), /requires conflict/u);
  assert.equal((await service.reviewDelete(SESSION_ID, local.identity.interopId, 'apply')).state, 'ready');
});

test('incremental checkpoints are monotonic and changes are ordered by canonical identity', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const now = clock();
  const { repository, service } = await start(db, now);
  const { local, remote } = conflictPair();
  await service.receive(SESSION_ID, syncEnvelope(remote), local);
  assert.equal((await repository.changesAfter(SESSION_ID, 'overlook', 1)).length, 1);
  assert.equal((await repository.advanceCheckpoint(SESSION_ID, 'overlook', 2, now())).checkpoints.overlook, 2);
  assert.equal((await repository.advanceCheckpoint(SESSION_ID, 'overlook', 1, now())).checkpoints.overlook, 2);
});

test('reviewed direction, scope, and transfer identity fail closed', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new SyncJournalRepository(db);
  const service = new SyncProtocolService('image-trail', repository, { now: clock() });
  await assert.rejects(
    service.start({
      sessionId: SESSION_ID,
      pairingId: PAIRING_ID,
      sourceProduct: 'image-trail',
      targetProduct: 'overlook',
      direction: 'overlook-to-image-trail',
      scope: { kind: 'all', localIds: [] },
    }),
    /direction does not match/u,
  );
  await assert.rejects(
    service.start({
      sessionId: SESSION_ID,
      pairingId: PAIRING_ID,
      sourceProduct: 'image-trail',
      targetProduct: 'overlook',
      direction: 'image-trail-to-overlook',
      scope: { kind: 'selected', localIds: [] },
    }),
    /scope ids/u,
  );
  await service.start({
    sessionId: SESSION_ID,
    pairingId: PAIRING_ID,
    sourceProduct: 'image-trail',
    targetProduct: 'overlook',
    direction: 'image-trail-to-overlook',
    scope: { kind: 'all', localIds: [] },
  });
  const envelope = syncEnvelope(conflictPair().remote, '2d5b09d6-1be9-44a0-aac3-f06cbdc4617b');
  await assert.rejects(service.receive(SESSION_ID, envelope, conflictPair().local), /does not match the durable session identity/u);
});
