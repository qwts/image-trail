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
import { generateAesGcmKey } from '../extension/src/data/crypto/webcrypto.js';
import { importInteropPairingBundle } from '../extension/src/data/interop/pairing-import.js';
import { MoveOutboxPublishError, MoveOutboxPublisher } from '../extension/src/data/interop/move-outbox-publisher.js';
import { InteropRecordExportStore } from '../extension/src/data/interop/record-export.js';
import { openInteropMessage, sealInteropMessage } from '../extension/src/data/interop/sealed-message.js';
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
  assert.equal((await new BookmarksRepository(opened.db).getEncrypted('bookmark-1'))?.queueUpdatedAt, '2026-07-17T12:03:00.000Z');
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
