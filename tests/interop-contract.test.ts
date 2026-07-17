import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import 'fake-indexeddb/auto';
import * as v from 'valibot';
import {
  compareInteropRevisions,
  incrementInteropRevision,
  mergeInteropRevisions,
  type InteropConflictAction,
  type InteropErrorCode,
  type InteropFieldRevisions,
  type InteropIdentity,
  type InteropOperation,
  type InteropReviewCategory,
  type InteropTransferPhase,
  interopUuidSchema,
} from '../extension/src/core/interop/contract.js';
import {
  parseInteropEnvelope,
  type InteropCounts,
  type InteropEnvelope,
  type InteropError,
  type InteropPayload,
} from '../extension/src/core/interop/messages.js';
import {
  interopPairingBundleSchema,
  interopPairingPayloadSchema,
  type InteropPairingBundle,
  type InteropPairingPayload,
} from '../extension/src/core/interop/pairing.js';
import { InteropReplayError, InteropReplayGuard, interopReplayIdentity } from '../extension/src/core/interop/replay.js';
import type { InteropAlbum, InteropBlobReference, InteropRecord } from '../extension/src/core/interop/records.js';
import { generateAesGcmKey } from '../extension/src/data/crypto/webcrypto.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { importInteropPairingBundle } from '../extension/src/data/interop/pairing-import.js';
import { InteropPairingError, openInteropPairingBundle } from '../extension/src/data/interop/pairing-bundle.js';
import { InteropKeysRepository } from '../extension/src/data/repositories/interop-keys-repository.js';
import { IMAGE_TRAIL_DB_NAME } from '../extension/src/data/schema.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`contracts/interop/v1/fixtures/${name}`, 'utf8')) as unknown;
}

async function deleteImageTrailDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(IMAGE_TRAIL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Image Trail test database deletion was blocked.'));
  });
}

async function openFreshImageTrailDb(): Promise<IDBDatabase> {
  await deleteImageTrailDb();
  const opened = await openImageTrailDb();
  assert.equal(opened.status.ok, true, opened.status.message);
  assert.ok(opened.db);
  return opened.db;
}

async function assertDeterministicInteropKey(key: CryptoKey): Promise<void> {
  const raw = Uint8Array.from({ length: 32 }, (_value, index) => index + 32);
  const expected = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  raw.fill(0);
  const iv = Uint8Array.from({ length: 12 }, (_value, index) => index + 64);
  const plaintext = new TextEncoder().encode('interop-key-parity');
  const actualCiphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const expectedCiphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, expected, plaintext);
  assert.deepEqual(new Uint8Array(actualCiphertext), new Uint8Array(expectedCiphertext));
  plaintext.fill(0);
  iv.fill(0);
}

test('vendored interoperability artifacts match the pinned canonical Photos contract', () => {
  const output = execFileSync(process.execPath, ['scripts/check-interop-contract.mjs'], { encoding: 'utf8' });
  assert.equal(output, 'Verified 10 canonical interop files from d75346749046ca9ac337e4d987d0e4ad7fed1c8e.\n');
});

test('maps every companion epic scenario to current cross-repository evidence', () => {
  const output = execFileSync(process.execPath, ['scripts/check-interop-acceptance.mjs'], { encoding: 'utf8' });
  assert.equal(output, 'Verified 10 interop scenarios with 40 automated evidence references; manual 0/4.\n');
});

test('refuses companion evidence from a checkout that is not pinned to the reviewed revision', () => {
  const result = spawnSync(process.execPath, ['scripts/check-interop-acceptance.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, INTEROP_PHOTOS_ROOT: process.cwd() },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /evidence checkout must be pinned/u);
});

test('canonical valid and round-trip fixtures parse without changing their data', () => {
  const valid = fixture('valid-record-message.json');
  const parsed = parseInteropEnvelope(valid);
  assert.deepEqual(parsed, valid);
  assert.equal(parsed.payload.kind, 'record');
  assert.equal(parsed.payload.kind === 'record' && parsed.payload.record.original.state, 'metadata-only');

  const roundTrip = fixture('round-trip-record-message.json');
  const parsedRoundTrip = parseInteropEnvelope(roundTrip);
  assert.deepEqual(parsedRoundTrip, roundTrip);
  assert.equal(parsedRoundTrip.payload.kind === 'record' && parsedRoundTrip.payload.record.roundTripMetadata.overlook['rating'], 4);
});

test('UUID edge values match the canonical Zod contract', () => {
  assert.equal(v.parse(interopUuidSchema, '00000000-0000-0000-0000-000000000000'), '00000000-0000-0000-0000-000000000000');
  assert.equal(v.parse(interopUuidSchema, 'ffffffff-ffff-ffff-ffff-ffffffffffff'), 'ffffffff-ffff-ffff-ffff-ffffffffffff');
  assert.throws(() => v.parse(interopUuidSchema, 'not-a-uuid'));
});

test('timestamps and integers match the canonical contract boundaries', () => {
  const valid = fixture('valid-record-message.json') as { header: Record<string, unknown>; payload: Record<string, unknown> };
  assert.equal(
    parseInteropEnvelope({ ...valid, header: { ...valid.header, createdAt: '2026-07-16T10:00Z' } }).header.createdAt,
    '2026-07-16T10:00Z',
  );
  assert.throws(() => parseInteropEnvelope({ ...valid, header: { ...valid.header, createdAt: '2026-07-16T10:00:00+01:00' } }));
  assert.equal(
    parseInteropEnvelope({ ...valid, header: { ...valid.header, sequence: Number.MAX_SAFE_INTEGER } }).header.sequence,
    Number.MAX_SAFE_INTEGER,
  );
  assert.throws(() => parseInteropEnvelope({ ...valid, header: { ...valid.header, sequence: Number.MAX_SAFE_INTEGER + 1 } }));

  const pairing = fixture('valid-pairing-bundle.json') as Record<string, unknown>;
  assert.equal(v.parse(interopPairingBundleSchema, { ...pairing, createdAt: '2026-07-16T10:00Z' }).createdAt, '2026-07-16T10:00Z');
  assert.throws(() => v.parse(interopPairingBundleSchema, { ...pairing, createdAt: '2026-07-16T10:00:00+01:00' }));
  assert.throws(() => incrementInteropRevision({ imageTrail: Number.MAX_SAFE_INTEGER, overlook: 0 }, 'image-trail'), RangeError);
});

test('invalid, future-version, unknown-field, same-product, and mismatched-kind messages fail closed', () => {
  assert.throws(() => parseInteropEnvelope(fixture('invalid-record-message.json')));
  assert.throws(() => parseInteropEnvelope(fixture('rejected-future-version.json')));
  const valid = fixture('valid-record-message.json') as { header: Record<string, unknown>; payload: Record<string, unknown> };
  assert.throws(() => parseInteropEnvelope({ ...valid, extra: true }));
  assert.throws(() => parseInteropEnvelope({ ...valid, header: { ...valid.header, targetProduct: 'image-trail' } }));
  assert.throws(() => parseInteropEnvelope({ ...valid, header: { ...valid.header, kind: 'manifest' } }));
});

test('provider paths and chunk bounds reject traversal and impossible chunks', () => {
  const valid = fixture('valid-record-message.json') as { header: Record<string, unknown>; payload: Record<string, unknown> };
  const blobMessage = {
    ...valid,
    header: { ...valid.header, kind: 'blob' },
    payload: {
      kind: 'blob',
      schemaVersion: 1,
      recordInteropId: '4d220c3e-16bd-4833-891c-3ef9b980b3fb',
      role: 'original',
      blob: {
        state: 'available',
        blobId: 'original-123',
        mimeType: 'image/jpeg',
        byteLength: 42,
        contentHash: 'c'.repeat(64),
      },
      encryptedPath: 'records/original.bin',
      chunkIndex: 0,
      chunkCount: 1,
    },
  };
  assert.equal(parseInteropEnvelope(blobMessage).payload.kind, 'blob');
  assert.throws(() => parseInteropEnvelope({ ...blobMessage, payload: { ...blobMessage.payload, encryptedPath: '../original.bin' } }));
  assert.throws(() => parseInteropEnvelope({ ...blobMessage, payload: { ...blobMessage.payload, chunkIndex: 1 } }));
});

test('revision and replay behavior matches the canonical actor model', () => {
  assert.equal(compareInteropRevisions({ imageTrail: 1, overlook: 2 }, { imageTrail: 1, overlook: 2 }), 'equal');
  assert.equal(compareInteropRevisions({ imageTrail: 1, overlook: 2 }, { imageTrail: 2, overlook: 2 }), 'before');
  assert.equal(compareInteropRevisions({ imageTrail: 3, overlook: 2 }, { imageTrail: 2, overlook: 2 }), 'after');
  assert.equal(compareInteropRevisions({ imageTrail: 3, overlook: 1 }, { imageTrail: 2, overlook: 2 }), 'concurrent');
  assert.deepEqual(incrementInteropRevision({ imageTrail: 1, overlook: 2 }, 'image-trail'), { imageTrail: 2, overlook: 2 });
  assert.deepEqual(mergeInteropRevisions({ imageTrail: 4, overlook: 1 }, { imageTrail: 2, overlook: 3 }), {
    imageTrail: 4,
    overlook: 3,
  });

  const replay = fixture('replay-message.json') as {
    first: { pairingId: string; messageId: string };
    replay: { pairingId: string; messageId: string };
  };
  assert.equal(interopReplayIdentity(replay.first), interopReplayIdentity(replay.replay));
  const guard = new InteropReplayGuard();
  guard.observe(replay.first);
  assert.throws(() => guard.observe(replay.replay), InteropReplayError);
  guard.observe({ ...replay.replay, pairingId: 'fe6ef9a7-57af-460e-8525-fad45cc79afd' });
});

test('canonical TypeScript aliases describe the parsed public contract', () => {
  const envelope: InteropEnvelope = parseInteropEnvelope(fixture('valid-record-message.json'));
  assert.equal(envelope.payload.kind, 'record');
  if (envelope.payload.kind !== 'record') return;
  const payload: InteropPayload = envelope.payload;
  const record: InteropRecord = envelope.payload.record;
  const album: InteropAlbum | undefined = envelope.payload.albums[0];
  assert.ok(album);
  const blob: InteropBlobReference = record.original;
  const identity: InteropIdentity = record.identity;
  const fieldRevisions: InteropFieldRevisions = record.fieldRevisions;
  const operation: InteropOperation = envelope.header.operation;
  const reviewCategory: InteropReviewCategory = envelope.payload.reviewCategory;
  const conflictAction: InteropConflictAction = 'keep-both';
  const phase: InteropTransferPhase = 'reviewing';
  const errorCode: InteropErrorCode = 'replay';
  const counts: InteropCounts = {
    total: 1,
    eligible: 1,
    duplicate: 0,
    conflict: 0,
    metadataOnly: 0,
    unsupported: 0,
    skipped: 0,
    failed: 0,
    acknowledged: 0,
    finalized: 0,
  };
  const error: InteropError = { code: errorCode, message: 'Duplicate', retryable: false, recordInteropId: identity.interopId };
  assert.deepEqual(
    [
      payload.kind,
      record.identity.interopId,
      album.interopId,
      blob.state,
      fieldRevisions,
      operation,
      reviewCategory,
      conflictAction,
      phase,
      counts,
      error,
    ],
    [
      'record',
      identity.interopId,
      '50ca91c1-a9c7-4c98-9ab4-b075cb600424',
      'metadata-only',
      fieldRevisions,
      'move',
      'metadata-only',
      'keep-both',
      'reviewing',
      counts,
      error,
    ],
  );
});

test('browser WebCrypto opens the canonical Photos pairing fixture with exact key parity', async () => {
  const bundle: InteropPairingBundle = v.parse(interopPairingBundleSchema, fixture('valid-pairing-bundle.json'));
  const opened = await openInteropPairingBundle(bundle, 'fixture-password');
  assert.equal(opened.pairingId, 'a3267e90-2bd1-432c-bc8b-78e4704f843f');
  assert.equal(opened.keyId, 'interop:0de6557b-a17d-4e36-99f0-c20e64f021de');
  assert.equal(opened.key.extractable, false);
  assert.deepEqual(opened.key.usages, ['encrypt', 'decrypt']);
  await assertDeterministicInteropKey(opened.key);

  const payload: InteropPairingPayload = {
    schemaVersion: 1,
    pairingId: opened.pairingId,
    keyId: opened.keyId,
    interopKey: Buffer.from(Uint8Array.from({ length: 32 }, (_value, index) => index + 32)).toString('base64'),
    products: ['image-trail', 'overlook'],
    createdAt: opened.createdAt,
  };
  assert.deepEqual(v.parse(interopPairingPayloadSchema, payload), payload);
});

test('pairing import fails closed for wrong passwords, corruption, future versions, and unknown fields', async () => {
  const valid = fixture('valid-pairing-bundle.json') as Record<string, unknown>;
  await assert.rejects(openInteropPairingBundle(valid, 'wrong-password'), /Unable to open pairing bundle/u);
  await assert.rejects(
    openInteropPairingBundle(fixture('corrupt-pairing-bundle.json'), 'fixture-password'),
    /Unable to open pairing bundle/u,
  );
  await assert.rejects(openInteropPairingBundle({ ...valid, formatVersion: 2 }, 'fixture-password'), /Unsupported pairing bundle version/u);
  await assert.rejects(openInteropPairingBundle({ ...valid, unknown: true }, 'fixture-password'), /Invalid pairing bundle/u);
  await assert.rejects(openInteropPairingBundle(valid, ''), /Pairing password is required/u);
});

test('pairing import persists only a non-extractable CryptoKey in extension-owned IndexedDB', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(async () => {
    db.close();
    await deleteImageTrailDb();
  });
  const imported = await importInteropPairingBundle({
    db,
    bundle: fixture('valid-pairing-bundle.json'),
    password: 'fixture-password',
    now: '2026-07-16T12:00:00.000Z',
  });
  assert.deepEqual(imported, {
    pairingId: 'a3267e90-2bd1-432c-bc8b-78e4704f843f',
    keyId: 'interop:0de6557b-a17d-4e36-99f0-c20e64f021de',
    createdAt: '2026-07-16T10:00:00.000Z',
  });

  const repository = new InteropKeysRepository(db);
  const stored = await repository.get(imported.keyId);
  assert.ok(stored);
  assert.equal(stored.key.extractable, false);
  assert.equal(stored.wrapping.mode, 'indexeddb');
  assert.equal(JSON.stringify(stored).includes('fixture-password'), false);
  assert.equal(JSON.stringify(stored).includes('ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Oz0+Pw=='), false);
  await assert.rejects(crypto.subtle.exportKey('raw', stored.key), /key is not extractable|InvalidAccess/u);
  await assertDeterministicInteropKey(stored.key);

  db.close();
  const reopened = await openImageTrailDb();
  assert.equal(reopened.status.ok, true, reopened.status.message);
  assert.ok(reopened.db);
  const restored = await new InteropKeysRepository(reopened.db).get(imported.keyId);
  assert.ok(restored);
  await assertDeterministicInteropKey(restored.key);
  reopened.db.close();
});

test('corrupt pairing imports leave no key and conflicting pairing identities are rejected', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(async () => {
    db.close();
    await deleteImageTrailDb();
  });
  await assert.rejects(
    importInteropPairingBundle({ db, bundle: fixture('corrupt-pairing-bundle.json'), password: 'fixture-password' }),
    InteropPairingError,
  );
  const repository = new InteropKeysRepository(db);
  assert.deepEqual(await repository.list(), []);

  const conflictKey = await generateAesGcmKey(false);
  await repository.put({
    kind: 'interop',
    uuid: 'c0478407-b2b6-46d0-9289-824bc3d515f0',
    reference: 'interop:c0478407-b2b6-46d0-9289-824bc3d515f0',
    pairingId: 'a3267e90-2bd1-432c-bc8b-78e4704f843f',
    createdAt: '2026-07-16T10:00:00.000Z',
    updatedAt: '2026-07-16T10:00:00.000Z',
    wrapping: { mode: 'indexeddb', algorithm: 'none' },
    extractable: false,
    key: conflictKey,
  });
  await assert.rejects(
    importInteropPairingBundle({ db, bundle: fixture('valid-pairing-bundle.json'), password: 'fixture-password' }),
    /Pairing identity conflicts/u,
  );
});
