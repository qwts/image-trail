import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';

import { defineMessage, dispatchRequest } from '../extension/src/background/message-dispatch.js';
import {
  MESSAGE_PROTOCOL_VERSION,
  MessageType,
  createSaveBookmarkResultMessage,
  isDeleteBlobResultMessage,
  isStorageUsageResponseMessage,
} from '../extension/src/background/messages.js';
import type { SaveBookmarkMessage, SaveBookmarkResultMessage } from '../extension/src/background/messages.js';
import { emptyPayloadSchema, saveBookmarkRequestSchema } from '../extension/src/background/message-schemas.js';

import { imageDisplayRecordSchema } from '../extension/src/core/display-records.schema.js';
import { parsedFieldStateRecordSchema, urlReviewStatusClearFilterSchema } from '../extension/src/core/types.schema.js';
import { plaintextLocalSettingsSchema } from '../extension/src/data/local-settings.schema.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/data/local-settings.js';
import { portableStoredBlobRecordSchema } from '../extension/src/data/import-export/full-backup.schema.js';

import {
  buildExportFileHeader,
  parseExportFile,
  serializeExportFile,
  toBase64,
} from '../extension/src/data/import-export/encrypted-file-format.js';
import { createPasswordSalt, deriveEncryptionKey } from '../extension/src/data/crypto/password-wrap.js';
import { createAesGcmIv, encryptAesGcm } from '../extension/src/data/crypto/webcrypto.js';
import { openEncryptedDownload } from '../extension/src/data/repositories/downloads-repository.js';

import { openImageTrailDb } from '../extension/src/data/db.js';
import { DataStore, IMAGE_TRAIL_DB_NAME } from '../extension/src/data/schema.js';
import { BlobsRepository } from '../extension/src/data/repositories/blobs-repository.js';
import type { StoredBlobRecord } from '../extension/src/data/types.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

const validDisplayRecord = { id: 'rec-1', url: 'https://example.test/a.jpg', timestamp: '2026-06-30T00:00:00.000Z' };

// ---------------------------------------------------------------------------
// Message boundary — dispatcher validates payloads before running the handler
// ---------------------------------------------------------------------------

function saveBookmarkRegistry(handle: () => Promise<SaveBookmarkResultMessage['payload']>) {
  return {
    [MessageType.SaveBookmark]: defineMessage<SaveBookmarkMessage, SaveBookmarkResultMessage, SaveBookmarkResultMessage['payload']>({
      requestSchema: saveBookmarkRequestSchema,
      handle,
      respond: (result) => createSaveBookmarkResultMessage(result),
      fallback: () => createSaveBookmarkResultMessage({ ok: false, message: 'Bookmark save failed.' }),
    }),
  };
}

test('dispatchRequest passes a valid SaveBookmark payload through to the handler', async () => {
  let sent: SaveBookmarkResultMessage | undefined;
  let handled = false;
  const registry = saveBookmarkRegistry(async () => {
    handled = true;
    return { ok: true, record: validDisplayRecord };
  });
  const message = {
    type: MessageType.SaveBookmark,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { record: validDisplayRecord },
  } as SaveBookmarkMessage;

  dispatchRequest(registry, message, (response) => {
    sent = response as SaveBookmarkResultMessage;
  });
  await flushMicrotasks();

  assert.equal(handled, true);
  assert.equal(sent?.payload.ok, true);
});

test('dispatchRequest rejects a SaveBookmark payload with a malformed record via the fallback', async () => {
  let sent: SaveBookmarkResultMessage | undefined;
  let handled = false;
  const registry = saveBookmarkRegistry(async () => {
    handled = true;
    return { ok: true, record: validDisplayRecord };
  });
  // `record.id` must be a string; a number makes the payload fail validation.
  const message = {
    type: MessageType.SaveBookmark,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { record: { ...validDisplayRecord, id: 123 } },
  } as unknown as SaveBookmarkMessage;

  const kept = dispatchRequest(registry, message, (response) => {
    sent = response as SaveBookmarkResultMessage;
  });
  await flushMicrotasks();

  assert.equal(kept, true);
  assert.equal(handled, false);
  assert.equal(sent?.payload.ok, false);
});

// ---------------------------------------------------------------------------
// Response-side guards
// ---------------------------------------------------------------------------

test('response guards accept well-formed payloads and reject malformed ones', () => {
  const usage = { totalBytes: 10, blobCount: 1 };
  assert.equal(
    isStorageUsageResponseMessage({ type: MessageType.StorageUsageResponse, version: MESSAGE_PROTOCOL_VERSION, payload: usage }),
    true,
  );
  // Malformed: blobCount must be a number.
  assert.equal(
    isStorageUsageResponseMessage({
      type: MessageType.StorageUsageResponse,
      version: MESSAGE_PROTOCOL_VERSION,
      payload: { totalBytes: 10, blobCount: 'lots' },
    }),
    false,
  );
  assert.equal(
    isDeleteBlobResultMessage({ type: MessageType.DeleteBlobResult, version: MESSAGE_PROTOCOL_VERSION, payload: { deleted: true, usage } }),
    true,
  );
  assert.equal(
    isDeleteBlobResultMessage({
      type: MessageType.DeleteBlobResult,
      version: MESSAGE_PROTOCOL_VERSION,
      payload: { deleted: 'yes', usage },
    }),
    false,
  );
});

// ---------------------------------------------------------------------------
// Record schemas — canonical fixtures pass, corrupted mutants fail
// ---------------------------------------------------------------------------

test('record schemas accept canonical fixtures and reject corrupted mutants with structured issues', () => {
  assert.equal(v.is(imageDisplayRecordSchema, validDisplayRecord), true);
  const badRecord = v.safeParse(imageDisplayRecordSchema, { ...validDisplayRecord, url: 42 });
  assert.equal(badRecord.success, false);
  if (!badRecord.success) {
    assert.ok(badRecord.issues.some((issue) => v.getDotPath(issue) === 'url'));
  }

  const parsedFieldState = {
    schemaVersion: 1,
    hostname: 'example.test',
    pageUrl: 'https://example.test/p',
    sourceUrl: 'https://example.test/s.jpg',
    selectedUrl: null,
    selectedHandleId: null,
    activeFieldId: null,
    failedFieldId: null,
    successfulFieldIds: [],
    unchangedFieldIds: [],
    unlockedFieldIds: [],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: null,
    updatedAt: '2026-06-30T00:00:00.000Z',
  };
  assert.equal(v.is(parsedFieldStateRecordSchema, parsedFieldState), true);
  assert.equal(v.is(parsedFieldStateRecordSchema, { ...parsedFieldState, hostname: 5 }), false);

  assert.equal(v.is(plaintextLocalSettingsSchema, DEFAULT_LOCAL_SETTINGS), true);
  assert.equal(v.is(plaintextLocalSettingsSchema, { ...DEFAULT_LOCAL_SETTINGS, panelDock: 'up' }), false);

  assert.equal(v.is(urlReviewStatusClearFilterSchema, { scope: 'all' }), true);
  assert.equal(v.is(urlReviewStatusClearFilterSchema, { scope: 'page', hostname: 'h', pageUrl: 'p' }), true);
  assert.equal(v.is(urlReviewStatusClearFilterSchema, { scope: 'bogus' }), false);

  const portableBlob = {
    id: 'b1',
    kind: 'original',
    schemaVersion: 1,
    algorithm: 'AES-GCM',
    iv: 'iv',
    ciphertext: 'AAAA',
    encryptedByteLength: 4,
    createdAt: '2026-06-30T00:00:00.000Z',
    key: { kind: 'blob', uuid: 'k', reference: 'blob:k' },
    referenceCount: 1,
  };
  assert.equal(v.is(portableStoredBlobRecordSchema, portableBlob), true);
  // Thumbnails are not portable originals.
  assert.equal(v.is(portableStoredBlobRecordSchema, { ...portableBlob, kind: 'thumbnail' }), false);
});

test('emptyPayloadSchema accepts an empty object and tolerates forward-compat extra keys', () => {
  assert.equal(v.is(emptyPayloadSchema, {}), true);
  assert.equal(v.is(emptyPayloadSchema, { unexpected: 'field' }), true);
  assert.equal(v.is(emptyPayloadSchema, null), false);
});

// ---------------------------------------------------------------------------
// Import/export boundary
// ---------------------------------------------------------------------------

test('parseExportFile rejects an export header with an out-of-range payloadType', () => {
  const header = buildExportFileHeader({
    payloadType: 'history',
    algorithm: 'AES-GCM',
    wrappingMode: 'password',
    keyKind: 'export',
    keyReference: 'export:x',
    salt: new Uint8Array([1, 2, 3]),
    iv: new Uint8Array([4, 5, 6]),
    iterations: 600_000,
    recordCount: 1,
    now: '2026-06-30T00:00:00.000Z',
  });
  const valid = serializeExportFile({ header, payload: 'dGVzdA==' });
  assert.equal(parseExportFile(valid).header.payloadType, 'history');

  const tampered = JSON.parse(valid);
  tampered.header.payloadType = 'bogus';
  assert.throws(() => parseExportFile(JSON.stringify(tampered)), /Invalid export file/u);
});

test('openEncryptedDownload rejects a decrypted payload that fails its schema', async () => {
  const password = 'download-password';
  const salt = createPasswordSalt();
  const iterations = 600_000;
  const key = await deriveEncryptionKey(password, { salt, iterations });
  const iv = createAesGcmIv();
  // Missing the required `data` field.
  const badPayload = new TextEncoder().encode(JSON.stringify({ mimeType: 'image/png', sourceUrl: 'https://example.test/x.png' }));
  const ciphertext = await encryptAesGcm(key, badPayload, iv);
  const header = buildExportFileHeader({
    payloadType: 'mixed',
    algorithm: 'AES-GCM',
    wrappingMode: 'password',
    keyKind: 'export',
    keyReference: 'export:y',
    salt,
    iv,
    iterations,
    recordCount: 1,
    now: '2026-06-30T00:00:00.000Z',
  });
  const fileContent = serializeExportFile({ header, payload: toBase64(ciphertext) });

  await assert.rejects(openEncryptedDownload(fileContent, password), /Encrypted download payload is invalid/u);
});

// ---------------------------------------------------------------------------
// IndexedDB boundary — corrupted rows are quarantined, not propagated
// ---------------------------------------------------------------------------

async function openFreshDb(): Promise<IDBDatabase> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(IMAGE_TRAIL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Blocked deleting test database.'));
  });
  const result = await openImageTrailDb();
  assert.ok(result.status.ok, `DB open failed: ${result.status.message}`);
  return result.db!;
}

function validBlob(): StoredBlobRecord {
  return {
    id: 'valid-blob',
    kind: 'original',
    schemaVersion: 1,
    algorithm: 'AES-GCM',
    iv: 'AAAAAAAAAAAAAAAA',
    ciphertext: new ArrayBuffer(8),
    encryptedByteLength: 8,
    createdAt: '2026-06-30T00:00:00.000Z',
    key: createKeyReference('blob', 'k'),
    referenceCount: 1,
  };
}

test('BlobsRepository quarantines a corrupted row on hydration and never propagates it', async (t) => {
  const db = await openFreshDb();
  t.after(() => db.close());
  const warn = t.mock.method(console, 'warn', () => {});
  const repo = new BlobsRepository(db);

  await repo.put(validBlob());

  // Insert a structurally invalid row directly, bypassing the repository.
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DataStore.Blobs, 'readwrite');
    transaction.objectStore(DataStore.Blobs).put({ id: 'corrupt-blob', kind: 'not-a-kind', schemaVersion: 99 });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  const listed = await repo.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, 'valid-blob');

  assert.equal(await repo.get('corrupt-blob'), undefined);
  const valid = await repo.get('valid-blob');
  assert.equal(valid?.id, 'valid-blob');

  assert.ok(warn.mock.callCount() >= 1);
  assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes(DataStore.Blobs)));
});
