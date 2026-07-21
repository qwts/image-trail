import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

import {
  sha256,
  EncryptedInteropTransport,
  InteropTransportError,
  type InteropObjectPage,
  type InteropObjectStore,
} from '../extension/src/core/interop/transport.js';
import { ensureDurableBookmarkKey } from '../extension/src/data/durable-bookmark-key.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { sealBlobPayload } from '../extension/src/data/crypto/binary-envelope.js';
import { generateAesGcmKey } from '../extension/src/data/crypto/webcrypto.js';
import { importInteropPairingBundle } from '../extension/src/data/interop/pairing-import.js';
import { MoveOutboxPublishError, MoveOutboxPublisher } from '../extension/src/data/interop/move-outbox-publisher.js';
import { InteropRecordExportStore } from '../extension/src/data/interop/record-export.js';
import { openInteropMessage, sealInteropMessage } from '../extension/src/data/interop/sealed-message.js';
import { openInteropBlob, sealInteropBlob } from '../extension/src/data/interop/sealed-blob.js';
import { BlobsRepository } from '../extension/src/data/repositories/blobs-repository.js';
import { SecureMoveOutboxRepository } from '../extension/src/data/interop/secure-move-outbox-repository.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { EncryptedPinsRepository } from '../extension/src/data/repositories/encrypted-pins-repository.js';
import { InteropKeysRepository } from '../extension/src/data/repositories/interop-keys-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';

const INTEROP_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const TRANSFER_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_INTEROP_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const BLOB_KEY_ID = '66666666-6666-4666-8666-666666666666';
const BLOB_MESSAGE_ID = '77777777-7777-4777-8777-777777777777';
const BLOB_STORAGE_ID = '88888888-8888-4888-8888-888888888888';

class MemoryStore implements InteropObjectStore {
  readonly provider = 'pcloud' as const;
  readonly objects = new Map<string, Uint8Array>();
  failPuts = 0;

  authState(): Promise<'connected'> {
    return Promise.resolve('connected');
  }
  put(path: string, bytes: Uint8Array): Promise<{ readonly bytes: number }> {
    if (this.failPuts > 0) {
      this.failPuts -= 1;
      return Promise.reject(new InteropTransportError('offline', 'offline', true));
    }
    this.objects.set(path, bytes.slice());
    return Promise.resolve({ bytes: bytes.byteLength });
  }
  get(path: string): Promise<Uint8Array> {
    const value = this.objects.get(path);
    return value ? Promise.resolve(value.slice()) : Promise.reject(new InteropTransportError('missing', 'not-found', false));
  }
  list(prefix: string, _cursor: string | null): Promise<InteropObjectPage> {
    return Promise.resolve({
      entries: [...this.objects.entries()]
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, value]) => ({ path, bytes: value.byteLength })),
      nextCursor: null,
    });
  }
  delete(path: string): Promise<void> {
    this.objects.delete(path);
    return Promise.resolve();
  }
  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number }> {
    return Promise.resolve({ usedBytes: 0, totalBytes: 10_000_000 });
  }
  async verify(path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    const value = await this.get(path);
    return { sha256: await sha256(value), bytes: value.byteLength };
  }
}

async function seedBookmark(
  db: IDBDatabase,
  id = 'bookmark-1',
  url = 'https://example.test/original.jpg',
  title = 'Private title',
): Promise<void> {
  const key = await ensureDurableBookmarkKey(new KeysRepository(db));
  await new BookmarksRepository(db).sealAndPut(
    id,
    {
      url,
      title,
      label: 'original.jpg',
      thumbnail: 'data:image/png;base64,AQID',
      width: 640,
      height: 480,
      bookmarkedAt: '2026-07-17T12:00:00.000Z',
      capturedAt: '2026-07-17T12:01:00.000Z',
      storedOriginal: { blobId: 'blob-1', mimeType: 'image/jpeg', byteLength: 42, capturedAt: '2026-07-17T12:01:00.000Z' },
    },
    key.key,
    key.reference,
    '2026-07-17T12:02:00.000Z',
    url,
    '2026-07-17T12:03:00.000Z',
  );
}

async function seedProtectedBookmark(db: IDBDatabase) {
  const bookmarkKey = await ensureDurableBookmarkKey(new KeysRepository(db));
  const active = { reference: createKeyReference('blob', BLOB_KEY_ID), key: await generateAesGcmKey(false) };
  await new EncryptedPinsRepository(db).sealAndPut({
    id: 'encrypted-pin-1',
    plainPinId: 'protected-1',
    urlHash: 'private-url-hash',
    queueUpdatedAt: '2026-07-17T12:03:00.000Z',
    payload: {
      url: 'https://private.example.test/secret.jpg',
      title: 'Unlocked private title',
      label: 'secret.jpg',
      bookmarkedAt: '2026-07-17T12:00:00.000Z',
      storedOriginal: {
        blobId: 'private-blob-1',
        mimeType: 'image/jpeg',
        byteLength: 84,
        capturedAt: '2026-07-17T12:01:00.000Z',
      },
      thumbnailId: 'encrypted-thumbnail-1',
    },
    key: active.key,
    keyReference: active.reference,
    now: '2026-07-17T12:02:00.000Z',
  });
  await new BookmarksRepository(db).sealAndPut(
    'protected-1',
    {
      url: 'image-trail-private:protected-1',
      label: 'Private pin',
      bookmarkedAt: '2026-07-17T12:03:00.000Z',
      protectedPin: {
        schemaVersion: 1,
        plainPinId: 'protected-1',
        encryptedPinId: 'encrypted-pin-1',
        encryptedThumbnailId: 'encrypted-thumbnail-1',
        storedOriginalBlobId: 'private-blob-1',
        queueUpdatedAt: '2026-07-17T12:03:00.000Z',
        hasEncryptedMetadata: true,
        hasEncryptedThumbnail: true,
        hasStoredOriginal: true,
      },
    },
    bookmarkKey.key,
    bookmarkKey.reference,
    '2026-07-17T12:02:00.000Z',
    'image-trail-private:protected-1',
    '2026-07-17T12:03:00.000Z',
  );
  return active;
}

async function seedOriginalBlob(db: IDBDatabase) {
  const active = { reference: createKeyReference('blob', BLOB_KEY_ID), key: await generateAesGcmKey(false) };
  const bytes = Uint8Array.from({ length: 42 }, (_value, index) => index);
  const createdAt = '2026-07-17T12:01:00.000Z';
  const aad = {
    id: 'blob-1',
    kind: 'original' as const,
    schemaVersion: 1 as const,
    algorithm: 'AES-GCM' as const,
    createdAt,
    key: active.reference,
  };
  const sealed = await sealBlobPayload({
    key: active.key,
    aad,
    metadata: {
      mimeType: 'image/jpeg',
      byteLength: bytes.byteLength,
      sourceUrl: 'https://example.test/original.jpg',
      capturedAt: createdAt,
    },
    bytes: bytes.buffer,
  });
  await new BlobsRepository(db).put({ ...aad, ...sealed, referenceCount: 1 });
  return { active, bytes };
}

test('ordinary encrypted pins gain stable canonical custody without changing queue order', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  await seedBookmark(opened.db);
  const exporter = new InteropRecordExportStore(opened.db, {
    now: () => '2026-07-17T12:04:00.000Z',
    createId: () => INTEROP_ID,
  });
  const first = await exporter.review(['bookmark-1']);
  const second = await exporter.review(['bookmark-1']);
  assert.equal(first.records[0]?.record.identity.interopId, INTEROP_ID);
  assert.deepEqual(second.records, first.records);
  assert.equal(first.records[0]?.reviewCategory, 'metadata-only');
  assert.equal(first.records[0]?.record.original.state, 'metadata-only');
  assert.equal(first.records[0]?.record.identity.contentHash, null);
  assert.equal((await new BookmarksRepository(opened.db).getEncrypted('bookmark-1'))?.queueUpdatedAt, '2026-07-17T12:03:00.000Z');
});

test('a later verified original updates stable canonical identity custody', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  await seedBookmark(opened.db);
  const exporter = new InteropRecordExportStore(opened.db, {
    now: () => '2026-07-17T12:04:00.000Z',
    createId: () => INTEROP_ID,
  });
  const metadataOnly = await exporter.review(['bookmark-1']);
  assert.equal(metadataOnly.records[0]?.record.identity.contentHash, null);

  const { active, bytes } = await seedOriginalBlob(opened.db);
  const verified = await exporter.review(['bookmark-1'], active);
  const expectedHash = await sha256(bytes);
  assert.equal(verified.records[0]?.record.identity.interopId, INTEROP_ID);
  assert.equal(verified.records[0]?.record.identity.contentHash, expectedHash);
  assert.equal(verified.records[0]?.record.original.state, 'available');
  assert.equal(
    verified.records[0]?.record.original.state === 'available' ? verified.records[0].record.original.contentHash : null,
    expectedHash,
  );

  const encrypted = await new BookmarksRepository(opened.db).getEncrypted('bookmark-1');
  assert.ok(encrypted);
  const key = await ensureDurableBookmarkKey(new KeysRepository(opened.db));
  const persisted = await new BookmarksRepository(opened.db).openRecord(encrypted, key.key);
  assert.equal(persisted.interop?.record.identity.contentHash, expectedHash);
  assert.equal(persisted.interop?.record.original.state, 'available');
});

test('record review zeroes decrypted original bytes when canonical review rejects the record', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  await seedBookmark(opened.db, 'bookmark-1', 'not a valid URL');
  const bytes = Uint8Array.from({ length: 42 }, (_value, index) => index);
  const exporter = new InteropRecordExportStore(opened.db, { createId: () => INTEROP_ID });
  const testHook = exporter as unknown as {
    openOriginal: () => Promise<{
      readonly reference: {
        readonly state: 'available';
        readonly blobId: string;
        readonly mimeType: string;
        readonly byteLength: number;
        readonly contentHash: string;
      };
      readonly bytes: Uint8Array;
    }>;
  };
  testHook.openOriginal = () =>
    Promise.resolve({
      reference: {
        state: 'available',
        blobId: 'blob-1',
        mimeType: 'image/jpeg',
        byteLength: bytes.byteLength,
        contentHash: '00'.repeat(32),
      },
      bytes,
    });
  const review = await exporter.review(['bookmark-1']);
  assert.equal(review.unsupported, 1);
  assert.deepEqual(review.records, []);
  assert.equal(
    bytes.every((byte) => byte === 0),
    true,
  );
});

test('unlocked captured originals queue an available record, blob message, and encrypted file as one record of progress', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  await seedBookmark(opened.db);
  const { active, bytes } = await seedOriginalBlob(opened.db);
  await importInteropPairingBundle({
    db: opened.db,
    bundle: JSON.parse(readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8')) as unknown,
    password: 'fixture-password',
  });
  const pairing = (await new InteropKeysRepository(opened.db).list())[0];
  assert.ok(pairing);
  const ids = [INTEROP_ID, MESSAGE_ID, BLOB_MESSAGE_ID, BLOB_STORAGE_ID];
  const store = new MemoryStore();
  const captured: { value?: Uint8Array } = {};
  const progress = await new MoveOutboxPublisher(opened.db, store, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    sealBlob: (input) => {
      captured.value = input.bytes;
      return sealInteropBlob(input);
    },
  }).start({ transferId: TRANSFER_ID, recordIds: ['bookmark-1'], pairing, activeBlobKey: active });
  assert.equal(progress.delivered, 1);
  assert.equal(progress.pending, 0);
  assert.equal(progress.counts.eligible, 1);
  assert.equal(progress.counts.metadataOnly, 0);
  const repository = new SecureMoveOutboxRepository(opened.db);
  const outbox = await repository.outbox(TRANSFER_ID);
  assert.equal(outbox.length, 3);
  const envelopes = await Promise.all(
    outbox
      .filter((row) => row.path.endsWith('.json.aesgcm'))
      .map((row) => openInteropMessage(new Uint8Array(row.ciphertext.slice(0)), pairing)),
  );
  const record = envelopes.find((envelope) => envelope.payload.kind === 'record');
  const blob = envelopes.find((envelope) => envelope.payload.kind === 'blob');
  assert.equal(record?.payload.kind === 'record' ? record.payload.record.original.state : null, 'available');
  assert.equal(
    record?.payload.kind === 'record' && record.payload.record.original.state === 'available'
      ? record.payload.record.identity.contentHash === record.payload.record.original.contentHash
      : false,
    true,
  );
  assert.equal(blob?.payload.kind === 'blob' ? blob.payload.encryptedPath : null, `blobs/${INTEROP_ID}/original.bin.aesgcm`);
  const binary = outbox.find((row) => row.path.endsWith('.bin.aesgcm'));
  assert.ok(binary);
  const openedBlob = await openInteropBlob(new Uint8Array(binary.ciphertext.slice(0)), pairing);
  assert.deepEqual(openedBlob.bytes, bytes);
  openedBlob.bytes.fill(0);
  assert.ok(captured.value);
  assert.equal(
    captured.value.every((byte) => byte === 0),
    true,
  );
  assert.deepEqual((await repository.item(TRANSFER_ID, INTEROP_ID))?.sourceMessageIds, [MESSAGE_ID, BLOB_MESSAGE_ID]);
});

test('unlocked protected pins export real metadata and keep canonical custody behind the session key', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  const active = await seedProtectedBookmark(opened.db);
  const exporter = new InteropRecordExportStore(opened.db, {
    now: () => '2026-07-17T12:04:00.000Z',
    createId: () => INTEROP_ID,
  });
  const first = await exporter.review(['protected-1'], active);
  const second = await exporter.review(['protected-1'], active);
  assert.equal(first.records[0]?.record.sourceUrl, 'https://private.example.test/secret.jpg');
  assert.equal(first.records[0]?.record.title, 'Unlocked private title');
  assert.equal(first.records[0]?.reviewCategory, 'metadata-only');
  assert.deepEqual(second.records, first.records);
  const protectedRecord = await new EncryptedPinsRepository(opened.db).get('encrypted-pin-1');
  assert.ok(protectedRecord);
  const protectedPayload = await new EncryptedPinsRepository(opened.db).openRecord(protectedRecord, active.key);
  assert.equal(protectedPayload.interop?.record.identity.interopId, INTEROP_ID);
  const relationship = await new BookmarksRepository(opened.db).getEncrypted('protected-1');
  assert.ok(relationship);
  const bookmarkKey = await ensureDurableBookmarkKey(new KeysRepository(opened.db));
  const relationshipPayload = await new BookmarksRepository(opened.db).openRecord(relationship, bookmarkKey.key);
  assert.equal(relationshipPayload.interop, undefined);
  assert.equal(relationship.queueUpdatedAt, '2026-07-17T12:03:00.000Z');
});

test('a sealing failure leaves no resumable partial Move selection', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  await seedBookmark(opened.db);
  await seedBookmark(opened.db, 'bookmark-2', 'https://example.test/two.jpg', 'Second title');
  await importInteropPairingBundle({
    db: opened.db,
    bundle: JSON.parse(readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8')) as unknown,
    password: 'fixture-password',
  });
  const pairing = (await new InteropKeysRepository(opened.db).list())[0];
  assert.ok(pairing);
  const ids = [INTEROP_ID, SECOND_INTEROP_ID, MESSAGE_ID, SECOND_MESSAGE_ID];
  let seals = 0;
  const publisher = new MoveOutboxPublisher(opened.db, new MemoryStore(), {
    now: () => '2026-07-17T12:04:00.000Z',
    createId: () => ids.shift() ?? crypto.randomUUID(),
    seal: async (envelope, key) => {
      seals += 1;
      if (seals === 2) throw new Error('simulated sealing failure');
      return sealInteropMessage(envelope, key);
    },
  });
  await assert.rejects(
    publisher.start({ transferId: TRANSFER_ID, recordIds: ['bookmark-1', 'bookmark-2'], pairing }),
    /simulated sealing failure/u,
  );
  assert.equal(await new SecureMoveOutboxRepository(opened.db).progress(TRANSFER_ID), null);
  assert.deepEqual(await new SecureMoveOutboxRepository(opened.db).outbox(TRANSFER_ID), []);
});

test('a failed provider write resumes from pairing-key-sealed local ciphertext after restart', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  await seedBookmark(opened.db);
  await importInteropPairingBundle({
    db: opened.db,
    bundle: JSON.parse(readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8')) as unknown,
    password: 'fixture-password',
  });
  const pairing = (await new InteropKeysRepository(opened.db).list())[0];
  assert.ok(pairing);
  const ids = [INTEROP_ID, MESSAGE_ID];
  const store = new MemoryStore();
  store.failPuts = 1;
  const publisher = new MoveOutboxPublisher(opened.db, store, {
    now: () => '2026-07-17T12:04:00.000Z',
    createId: () => ids.shift() ?? crypto.randomUUID(),
  });
  await assert.rejects(
    publisher.start({ transferId: TRANSFER_ID, recordIds: ['bookmark-1'], pairing }),
    (error: unknown) => error instanceof MoveOutboxPublishError && error.progress.pending === 1,
  );
  const resumed = await new MoveOutboxPublisher(opened.db, store).resume(TRANSFER_ID, pairing, 1);
  assert.equal(resumed.pending, 0);
  assert.equal(resumed.delivered, 1);
});

test('Move publication stores only pairing-key ciphertext and leaves a durable delivered outbox', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  await seedBookmark(opened.db);
  await importInteropPairingBundle({
    db: opened.db,
    bundle: JSON.parse(readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8')) as unknown,
    password: 'fixture-password',
  });
  const pairing = (await new InteropKeysRepository(opened.db).list())[0];
  assert.ok(pairing);
  const ids = [INTEROP_ID, MESSAGE_ID];
  const store = new MemoryStore();
  const publisher = new MoveOutboxPublisher(opened.db, store, {
    now: () => '2026-07-17T12:04:00.000Z',
    createId: () => ids.shift() ?? crypto.randomUUID(),
  });
  const progress = await publisher.start({ transferId: TRANSFER_ID, recordIds: ['bookmark-1'], pairing });
  assert.equal(progress.delivered, 1);
  assert.equal(progress.pending, 0);
  assert.equal(progress.counts.metadataOnly, 1);
  const outbox = (await new SecureMoveOutboxRepository(opened.db).outbox(TRANSFER_ID))[0];
  assert.ok(outbox);
  const path = outbox.path;
  const sealed = await new EncryptedInteropTransport(store).download({ pairingId: pairing.pairingId, transferId: TRANSFER_ID }, path);
  const envelope = await openInteropMessage(sealed, pairing);
  assert.equal(envelope.payload.kind, 'record');
  assert.equal(envelope.payload.kind === 'record' ? envelope.payload.record.sourceUrl : null, 'https://example.test/original.jpg');
  const providerBytes = new TextDecoder().decode(Uint8Array.from([...store.objects.values()].flatMap((value) => [...value])));
  assert.doesNotMatch(providerBytes, /Private title|example\.test|original\.jpg/u);
  const transaction = opened.db.transaction(['moveItems', 'moveOutbox'], 'readonly');
  const itemRequest = transaction.objectStore('moveItems').getAll();
  const outboxRequest = transaction.objectStore('moveOutbox').getAll();
  const requestResult = (request: IDBRequest<unknown[]>): Promise<unknown[]> =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const [items, rawOutbox] = await Promise.all([requestResult(itemRequest), requestResult(outboxRequest)]);
  const raw = JSON.stringify({
    items,
    outbox: rawOutbox,
  });
  assert.doesNotMatch(raw, /Private title|example\.test|original\.jpg/u);
});
