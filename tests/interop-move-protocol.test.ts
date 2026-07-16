import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import type { InteropProduct, InteropReviewCategory } from '../extension/src/core/interop/contract.js';
import { parseInteropEnvelope, type InteropEnvelope } from '../extension/src/core/interop/messages.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import type {
  InteropRecordImportResult,
  InteropRecordPreview,
  InteropRecordTranslationInput,
} from '../extension/src/data/interop/record-translation.js';
import { MoveJournalRepository } from '../extension/src/data/interop/move-journal-repository.js';
import { MoveProtocolError, MoveProtocolService, type MoveSourceOriginalAction } from '../extension/src/data/interop/move-protocol.js';

const FIRST_ACK_ID = '37813aa3-a4f4-4d23-8f35-43f64127388a';
const RETRY_ACK_ID = '0e3d566f-626d-4a94-9cb1-c20c11db0e76';
const STALE_ACK_ID = '72612e33-901d-40f6-b2f5-e9c4592343a6';

function fixture(name: 'valid-record-message' | 'round-trip-record-message'): InteropEnvelope {
  return parseInteropEnvelope(JSON.parse(readFileSync(`contracts/interop/v1/fixtures/${name}.json`, 'utf8')) as unknown);
}

function availableMoveRequest(): InteropEnvelope {
  const envelope = fixture('round-trip-record-message');
  return parseInteropEnvelope({ ...envelope, header: { ...envelope.header, operation: 'move' } });
}

function clock(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `2026-07-16T16:00:${String(tick).padStart(2, '0')}.000Z`;
  };
}

function ids(...values: readonly string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index++];
    if (!value) throw new Error('test exhausted deterministic message ids');
    return value;
  };
}

class FakeTranslationTarget {
  readonly records = new Map<string, string>();

  preview(input: InteropRecordTranslationInput): Promise<InteropRecordPreview> {
    const existingPinId = this.records.get(input.record.identity.interopId) ?? null;
    return Promise.resolve(preview(input, existingPinId ? 'duplicate' : input.reviewCategory, existingPinId));
  }

  importRecord(input: InteropRecordTranslationInput): Promise<InteropRecordImportResult> {
    const existingPinId = this.records.get(input.record.identity.interopId) ?? null;
    const category = existingPinId ? 'duplicate' : input.reviewCategory;
    if (category === 'eligible' || category === 'metadata-only') {
      const pinId = `pin:${input.record.identity.interopId}`;
      this.records.set(input.record.identity.interopId, pinId);
      return Promise.resolve({ ...preview(input, category, existingPinId), persisted: true, pinId });
    }
    return Promise.resolve({ ...preview(input, category, existingPinId), persisted: false, pinId: existingPinId });
  }
}

function preview(
  input: InteropRecordTranslationInput,
  category: InteropReviewCategory,
  existingPinId: string | null,
): InteropRecordPreview {
  return {
    category,
    existingPinId,
    displayUrl: input.record.sourceUrl ?? `image-trail-interop:${input.record.identity.interopId}`,
    sourceUrlAvailable: input.record.sourceUrl !== null,
    originalBytesAvailable: !!input.verifiedOriginal,
    thumbnailBytesAvailable: !!input.verifiedThumbnailDataUrl,
    reason: category,
  };
}

async function openProtocol(input: {
  readonly factory: IDBFactory;
  readonly localProduct: InteropProduct;
  readonly now: () => string;
  readonly translation: FakeTranslationTarget;
  readonly createMessageId?: (() => string) | undefined;
}): Promise<{ readonly db: IDBDatabase; readonly journals: MoveJournalRepository; readonly service: MoveProtocolService }> {
  const opened = await openImageTrailDb(input.factory);
  assert.ok(opened.db, opened.status.message);
  const journals = new MoveJournalRepository(opened.db);
  return {
    db: opened.db,
    journals,
    service: new MoveProtocolService(input.localProduct, journals, input.translation, {
      now: input.now,
      createMessageId: input.createMessageId,
    }),
  };
}

test('metadata-only Move resumes across every durable boundary without claiming an original', async () => {
  const request = fixture('valid-record-message');
  const sourceFactory = new IDBFactory();
  const targetFactory = new IDBFactory();
  const now = clock();
  const sourceTranslation = new FakeTranslationTarget();
  const targetTranslation = new FakeTranslationTarget();

  let source = await openProtocol({ factory: sourceFactory, localProduct: 'image-trail', now, translation: sourceTranslation });
  const queued = await source.service.queue(request);
  assert.equal(queued.phase, 'awaiting-acknowledgement');
  assert.equal(queued.counts.metadataOnly, 1);
  assert.deepEqual((await source.service.queue(request)).counts, queued.counts);
  source.db.close();

  source = await openProtocol({ factory: sourceFactory, localProduct: 'image-trail', now, translation: sourceTranslation });
  assert.equal((await source.journals.pendingOutbox(request.header.transferId)).length, 1);
  let target = await openProtocol({
    factory: targetFactory,
    localProduct: 'overlook',
    now,
    translation: targetTranslation,
    createMessageId: ids(FIRST_ACK_ID),
  });
  const acknowledgement = await target.service.receive(request, { verify: () => assert.fail('metadata-only must not verify bytes') });
  assert.equal(acknowledgement.payload.status, 'accepted');
  assert.equal(acknowledgement.payload.originalVerification, 'metadata-only');
  target.db.close();

  target = await openProtocol({
    factory: targetFactory,
    localProduct: 'overlook',
    now,
    translation: targetTranslation,
    createMessageId: ids(RETRY_ACK_ID),
  });
  assert.deepEqual(
    await target.service.receive(request, { verify: () => assert.fail('accepted replay must not verify') }),
    acknowledgement,
  );
  assert.equal(request.payload.kind, 'record');
  if (request.payload.kind !== 'record') throw new Error('record fixture expected');
  const alternate = fixture('round-trip-record-message');
  assert.equal(alternate.payload.kind, 'record');
  if (alternate.payload.kind !== 'record') throw new Error('record fixture expected');
  const changedReplays = [
    parseInteropEnvelope({
      ...request,
      payload: { ...request.payload, record: { ...request.payload.record, title: 'Changed replay title' } },
    }),
    parseInteropEnvelope({ ...request, payload: { ...request.payload, reviewCategory: 'eligible' } }),
    parseInteropEnvelope({ ...request, payload: { ...request.payload, albums: alternate.payload.albums } }),
    parseInteropEnvelope({
      ...request,
      payload: {
        ...request.payload,
        record: {
          ...request.payload.record,
          identity: { ...request.payload.record.identity, interopId: '59999999-9999-4999-8999-999999999999' },
        },
      },
    }),
  ];
  for (const changedReplay of changedReplays) {
    await assert.rejects(
      target.service.receive(changedReplay, { verify: () => assert.fail('changed replay must fail before verification') }),
      /reused with different content/u,
    );
  }
  await assert.rejects(
    target.service.receive(
      parseInteropEnvelope({ ...request, header: { ...request.header, transferId: '59999999-9999-4999-8999-999999999999' } }),
      { verify: () => assert.fail('cross-transfer replay must fail first') },
    ),
    /replay identity was reused/u,
  );
  target.db.close();

  assert.equal((await source.service.acknowledge(acknowledgement)).counts.acknowledged, 1);
  assert.equal((await source.service.acknowledge(acknowledgement)).counts.acknowledged, 1);
  let action: MoveSourceOriginalAction | null = null;
  const interrupted = await source.service.resumeFinalization(request.header.transferId, {
    finalize: (input) => {
      action = input.originalAction;
      throw new Error('fault after source finalizer started');
    },
  });
  assert.equal(interrupted.failed, 1);
  assert.equal(action, 'preserve-original');
  source.db.close();

  source = await openProtocol({ factory: sourceFactory, localProduct: 'image-trail', now, translation: sourceTranslation });
  const resumed = await source.service.resumeFinalization(request.header.transferId, {
    finalize: (input) => {
      assert.equal(input.originalAction, 'preserve-original');
      return Promise.resolve();
    },
  });
  assert.equal(resumed.journal.phase, 'completed');
  assert.equal(resumed.journal.counts.finalized, 1);
  assert.equal((await source.service.resumeFinalization(request.header.transferId, { finalize: () => assert.fail() })).finalized, 0);
  assert.deepEqual(
    (await source.journals.audit(request.header.transferId)).map((event) => event.event),
    ['queued', 'acknowledged', 'finalizing', 'failed', 'finalized'],
  );
  source.db.close();
});

test('available source stays intact until a retry proves target original custody', async () => {
  const request = availableMoveRequest();
  const now = clock();
  const source = await openProtocol({
    factory: new IDBFactory(),
    localProduct: 'overlook',
    now,
    translation: new FakeTranslationTarget(),
  });
  const target = await openProtocol({
    factory: new IDBFactory(),
    localProduct: 'image-trail',
    now,
    translation: new FakeTranslationTarget(),
    createMessageId: ids(FIRST_ACK_ID, RETRY_ACK_ID),
  });
  await source.service.queue(request);
  const rejected = await target.service.receive(request, {
    verify: () => Promise.resolve({ verified: false, targetLocalId: 'target-photo' }),
  });
  assert.equal(rejected.payload.status, 'rejected');
  assert.equal((await source.service.acknowledge(rejected)).counts.acknowledged, 0);
  let sourceRemoved = false;
  assert.equal(
    (
      await source.service.resumeFinalization(request.header.transferId, {
        finalize: () => {
          sourceRemoved = true;
          return Promise.resolve();
        },
      })
    ).finalized,
    0,
  );
  assert.equal(sourceRemoved, false);

  const accepted = await target.service.receive(request, {
    verify: () =>
      Promise.resolve({
        verified: true,
        targetLocalId: 'target-photo',
        verifiedOriginal: {
          blobId: 'target-original',
          mimeType: 'image/jpeg',
          byteLength: 42,
          capturedAt: '2026-07-16T16:01:00.000Z',
        },
      }),
  });
  assert.equal(accepted.payload.status, 'accepted');
  await source.service.acknowledge(accepted);
  const staleRejection = parseInteropEnvelope({ ...rejected, header: { ...rejected.header, messageId: STALE_ACK_ID } });
  assert.equal((await source.service.acknowledge(staleRejection)).counts.failed, 0);
  const completed = await source.service.resumeFinalization(request.header.transferId, {
    finalize: (input) => {
      assert.equal(input.originalAction, 'remove-after-verified-copy');
      sourceRemoved = true;
      return Promise.resolve();
    },
  });
  assert.equal(sourceRemoved, true);
  assert.equal(completed.journal.phase, 'completed');
  assert.equal(completed.journal.counts.finalized, 1);
  assert.equal((await target.journals.pendingOutbox(request.header.transferId)).length, 1);
  source.db.close();
  target.db.close();
});

test('review counts remain exact across replay and restart', async () => {
  const base = fixture('valid-record-message');
  assert.equal(base.payload.kind, 'record');
  if (base.payload.kind !== 'record') throw new Error('record fixture expected');
  const recordPayload = base.payload;
  const factory = new IDBFactory();
  const now = clock();
  const translation = new FakeTranslationTarget();
  let source = await openProtocol({ factory, localProduct: 'image-trail', now, translation });
  const categories = ['eligible', 'duplicate', 'skipped'] as const;
  const requests = categories.map((reviewCategory, index) =>
    parseInteropEnvelope({
      ...base,
      header: {
        ...base.header,
        messageId: `4${String(index + 1).repeat(7)}-${String(index + 1).repeat(4)}-4${String(index + 1).repeat(3)}-8${String(index + 1).repeat(3)}-${String(index + 1).repeat(12)}`,
        sequence: index + 1,
      },
      payload: {
        ...recordPayload,
        reviewCategory,
        record: {
          ...recordPayload.record,
          identity: {
            ...recordPayload.record.identity,
            interopId: `${String(index + 1).repeat(8)}-${String(index + 1).repeat(4)}-4${String(index + 1).repeat(3)}-8${String(index + 1).repeat(3)}-${String(index + 1).repeat(12)}`,
            origin: { ...recordPayload.record.identity.origin, localId: `bookmark-${String(index)}` },
          },
        },
      },
    }),
  );
  for (const request of requests) await source.service.queue(request);
  for (const request of requests) await source.service.queue(request);
  assert.deepEqual((await source.journals.getJournal(base.header.transferId))?.counts, {
    total: 3,
    eligible: 1,
    duplicate: 1,
    conflict: 0,
    metadataOnly: 0,
    unsupported: 0,
    skipped: 1,
    failed: 0,
    acknowledged: 0,
    finalized: 0,
  });
  source.db.close();
  source = await openProtocol({ factory, localProduct: 'image-trail', now, translation });
  assert.equal((await source.journals.pendingOutbox(base.header.transferId)).length, 3);
  source.db.close();
});

test('forged accepted acknowledgement cannot bypass the original custody guard', async () => {
  const request = availableMoveRequest();
  const source = await openProtocol({
    factory: new IDBFactory(),
    localProduct: 'overlook',
    now: clock(),
    translation: new FakeTranslationTarget(),
  });
  await source.service.queue(request);
  assert.equal(request.payload.kind, 'record');
  if (request.payload.kind !== 'record') throw new Error('record fixture expected');
  const forged = parseInteropEnvelope({
    header: {
      ...request.header,
      messageId: FIRST_ACK_ID,
      sourceProduct: 'image-trail',
      targetProduct: 'overlook',
      kind: 'acknowledgement',
    },
    payload: {
      kind: 'acknowledgement',
      schemaVersion: 1,
      status: 'accepted',
      recordInteropId: request.payload.record.identity.interopId,
      targetLocalId: 'target-photo',
      metadataPersisted: true,
      originalVerification: 'unavailable',
      acknowledgedMessageIds: [request.header.messageId],
      errors: [],
    },
  });
  await assert.rejects(source.service.acknowledge(forged), MoveProtocolError);
  assert.equal((await source.journals.getJournal(request.header.transferId))?.counts.acknowledged, 0);
  source.db.close();
});
