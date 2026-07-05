import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPasswordSalt,
  deriveWrappingKey,
  wrapKeyWithPassword,
  unwrapKeyWithPassword,
  PBKDF2_ITERATIONS,
} from '../extension/src/data/crypto/password-wrap.js';
import { generateAesGcmKey, getCrypto } from '../extension/src/data/crypto/webcrypto.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import {
  buildExportFileHeader,
  serializeExportFile,
  parseExportFile,
  validateExportFileHeader,
  EXPORT_FORMAT_MAGIC,
  EXPORT_FORMAT_VERSION,
} from '../extension/src/data/import-export/encrypted-file-format.js';
import { exportEncryptedHistory, exportPlainHistory } from '../extension/src/data/import-export/history-export.js';
import { importEncryptedHistory } from '../extension/src/data/import-export/history-import.js';
import { exportEncryptedBookmarks, exportPlainBookmarks } from '../extension/src/data/import-export/bookmarks-export.js';
import { importBookmarks } from '../extension/src/data/import-export/bookmarks-import.js';
import {
  exportEncryptedFullBackup,
  fullBackupPayloadFromUnknown,
  parseFullBackupPayload,
  storedBlobRecordFromPortable,
  portableStoredBlobRecord,
} from '../extension/src/data/import-export/full-backup.js';
import { recallEncryptedRecord, recallSelectedRecords } from '../extension/src/data/import-export/recall.js';
import { exportKeyWithPassword } from '../extension/src/data/import-export/key-export.js';
import { exportStoredKeyBackupWithPassword, importStoredKeyBackupWithPassword } from '../extension/src/data/import-export/key-backup.js';
import {
  createEncryptedImageFile,
  openEncryptedImageFile,
  parseEncryptedImageFileHeader,
} from '../extension/src/data/import-export/encrypted-image.js';
import { exportUrlReviewStatus, importUrlReviewStatus } from '../extension/src/data/import-export/url-review-status.js';
import { createSessionKey } from '../extension/src/data/crypto/keyring.js';
import { activateWrappedBlobKey, createAndActivateWrappedBlobKey } from '../extension/src/data/crypto/blob-keyring.js';
import { openBlobPayload, sealBlobPayload } from '../extension/src/data/crypto/binary-envelope.js';
import { sealJsonEnvelope } from '../extension/src/data/crypto/envelope.js';
import type { DurableBookmarkPayloadV1, DurableHistoryPayloadV1, StoredBlobRecord } from '../extension/src/data/types.js';
import type { StoredKeyRecord } from '../extension/src/data/crypto/types.js';

function requireBlobKeyRecord(record: StoredKeyRecord | undefined): StoredKeyRecord<'blob'> {
  if (record?.kind !== 'blob') throw new Error('Expected a blob key backup record.');
  return record as StoredKeyRecord<'blob'>;
}

test('password-wrap: derives a wrapping key from password and salt', async () => {
  const salt = createPasswordSalt();
  const key = await deriveWrappingKey('test-password', { salt, iterations: PBKDF2_ITERATIONS });
  assert.ok(key instanceof CryptoKey);
  assert.deepEqual(key.usages.sort(), ['unwrapKey', 'wrapKey']);
});

test('password-wrap: wraps and unwraps an AES-GCM key with password', async () => {
  const original = await generateAesGcmKey(true);
  const rawOriginal = new Uint8Array(await getCrypto().subtle.exportKey('raw', original));

  const wrapped = await wrapKeyWithPassword(original, 'my-password');
  assert.ok(wrapped.wrappedKey.byteLength > 0);
  assert.equal(wrapped.salt.byteLength, 16);
  assert.equal(wrapped.iv.byteLength, 12);

  const unwrapped = await unwrapKeyWithPassword(wrapped.wrappedKey, wrapped.iv, 'my-password', wrapped.salt, wrapped.iterations, true);
  const rawUnwrapped = new Uint8Array(await getCrypto().subtle.exportKey('raw', unwrapped));
  assert.deepEqual(rawUnwrapped, rawOriginal);
});

test('password-wrap: rejects unwrap with wrong password', async () => {
  const original = await generateAesGcmKey(true);
  const wrapped = await wrapKeyWithPassword(original, 'correct-password');

  await assert.rejects(unwrapKeyWithPassword(wrapped.wrappedKey, wrapped.iv, 'wrong-password', wrapped.salt, wrapped.iterations));
});

test('encrypted-file-format: builds and validates header with magic and version', () => {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  const header = buildExportFileHeader({
    payloadType: 'history',
    algorithm: 'AES-GCM',
    wrappingMode: 'password',
    keyKind: 'export',
    keyReference: 'export:test-ref',
    salt,
    iv,
    iterations: 600_000,
    recordCount: 5,
    now: '2026-06-18T00:00:00.000Z',
  });

  assert.equal(header.magic, EXPORT_FORMAT_MAGIC);
  assert.equal(header.formatVersion, EXPORT_FORMAT_VERSION);
  assert.equal(header.payloadType, 'history');
  assert.equal(header.recordCount, 5);
  assert.ok(validateExportFileHeader(header));
});

test('encrypted-file-format: serializes and parses round-trip', () => {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  const header = buildExportFileHeader({
    payloadType: 'history',
    algorithm: 'AES-GCM',
    wrappingMode: 'password',
    keyKind: 'export',
    keyReference: 'export:test-ref',
    salt,
    iv,
    iterations: 600_000,
    recordCount: 1,
  });

  const serialized = serializeExportFile({ header, payload: 'dGVzdA==' });
  const parsed = parseExportFile(serialized);
  assert.deepEqual(parsed.header.magic, EXPORT_FORMAT_MAGIC);
  assert.equal(parsed.payload, 'dGVzdA==');
});

test('encrypted-file-format: rejects invalid file format', () => {
  assert.throws(() => parseExportFile('not-json'));
  assert.throws(() => parseExportFile('{}'), /header validation failed/);
  assert.throws(() => parseExportFile(JSON.stringify({ header: { magic: 'WRONG' } })), /header validation failed/);
});

test('history-export: exports and history-import decrypts with correct password', async () => {
  const entries = [
    {
      uuid: 'entry-1',
      payload: {
        url: 'https://example.test/001.jpg',
        capturedAt: '2026-06-18T00:00:00.000Z',
        captureStatus: 'remote-only' as const,
      },
    },
    {
      uuid: 'entry-2',
      payload: {
        url: 'https://example.test/002.jpg',
        capturedAt: '2026-06-18T01:00:00.000Z',
        captureStatus: 'downloaded' as const,
        title: 'Second image',
      },
    },
  ];

  const exportResult = await exportEncryptedHistory({
    entries,
    password: 'export-pass-123',
    now: '2026-06-18T12:00:00.000Z',
  });

  assert.ok(exportResult.status.ok);
  assert.ok(exportResult.fileContent);
  assert.equal(exportResult.fileName, 'image-trail-history-2026-06-18.json');

  const importResult = await importEncryptedHistory(exportResult.fileContent!, 'export-pass-123');
  assert.ok(importResult.status.ok, importResult.status.message);
  assert.equal(importResult.entries.length, 2);
  assert.equal(importResult.entries[0]!.payload.url, 'https://example.test/001.jpg');
  assert.equal(importResult.entries[1]!.payload.title, 'Second image');
  assert.equal(importResult.skipped.length, 0);
});

test('history-import: rejects wrong password', async () => {
  const exportResult = await exportEncryptedHistory({
    entries: [
      {
        uuid: 'entry-1',
        payload: { url: 'https://example.test/001.jpg', capturedAt: '2026-06-18T00:00:00.000Z', captureStatus: 'remote-only' as const },
      },
    ],
    password: 'correct-password',
  });

  const importResult = await importEncryptedHistory(exportResult.fileContent!, 'wrong-password');
  assert.equal(importResult.status.ok, false);
  assert.equal(importResult.status.code, 'decryption-failed');
  assert.equal(importResult.entries.length, 0);
});

test('history-export: rejects empty record set', async () => {
  const result = await exportEncryptedHistory({ entries: [], password: 'pass' });
  assert.equal(result.status.ok, false);
  assert.equal(result.status.code, 'not-found');
});

test('history-export: shift/plain export imports without password', async () => {
  const entries = [
    {
      uuid: 'plain-history-1',
      payload: {
        url: 'https://example.test/plain.jpg',
        capturedAt: '2026-06-18T00:00:00.000Z',
        captureStatus: 'remote-only' as const,
      },
    },
  ];

  const exportResult = exportPlainHistory({ entries, now: '2026-06-18T12:00:00.000Z' });
  assert.ok(exportResult.status.ok);
  assert.equal(exportResult.fileName, 'image-trail-history-2026-06-18.plain.json');
  assert.match(exportResult.fileContent!, /https:\/\/example\.test\/plain\.jpg/);

  const importResult = await importEncryptedHistory(exportResult.fileContent!, '');
  assert.ok(importResult.status.ok, importResult.status.message);
  assert.equal(importResult.plaintext, true);
  assert.equal(importResult.entries[0]!.payload.url, 'https://example.test/plain.jpg');
});

test('bookmarks-export: exports encrypted and imports with password', async () => {
  const entries = [
    {
      uuid: 'bookmark-1',
      payload: {
        url: 'https://example.test/bookmark.jpg',
        bookmarkedAt: '2026-06-18T00:00:00.000Z',
        label: 'Bookmark',
      },
    },
  ];

  const exportResult = await exportEncryptedBookmarks({ entries, password: 'bookmark-pass', now: '2026-06-18T12:00:00.000Z' });
  assert.ok(exportResult.status.ok);
  assert.equal(exportResult.fileName, 'image-trail-bookmarks-2026-06-18.json');
  assert.doesNotMatch(exportResult.fileContent!, /bookmark\.jpg/);

  const importResult = await importBookmarks(exportResult.fileContent!, 'bookmark-pass');
  assert.ok(importResult.status.ok, importResult.status.message);
  assert.equal(importResult.plaintext, false);
  assert.equal(importResult.entries[0]!.payload.label, 'Bookmark');
});

test('bookmarks-export: encrypted export does not pass undefined AES-GCM additionalData', async () => {
  const originalEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  const calls: AesGcmParams[] = [];
  crypto.subtle.encrypt = ((algorithm: AlgorithmIdentifier, key: CryptoKey, data: BufferSource) => {
    const params = algorithm as AesGcmParams;
    if (typeof params === 'object' && params.name === 'AES-GCM') calls.push(params);
    return originalEncrypt(algorithm, key, data);
  }) as SubtleCrypto['encrypt'];

  try {
    const exportResult = await exportEncryptedBookmarks({
      entries: [
        {
          uuid: 'bookmark-1',
          payload: {
            url: 'https://example.test/bookmark.jpg',
            bookmarkedAt: '2026-06-18T00:00:00.000Z',
          },
        },
      ],
      password: 'bookmark-pass',
      now: '2026-06-18T12:00:00.000Z',
    });

    assert.ok(exportResult.status.ok, exportResult.status.message);
    assert.ok(calls.some((params) => !Object.hasOwn(params, 'additionalData')));
  } finally {
    crypto.subtle.encrypt = originalEncrypt as SubtleCrypto['encrypt'];
  }
});

test('bookmarks-import: strips external blob references from imported bookmark payloads', async () => {
  const exportResult = exportPlainBookmarks({
    entries: [
      {
        uuid: 'imported-captured-bookmark',
        payload: {
          url: 'https://example.test/captured.jpg',
          bookmarkedAt: '2026-06-20T00:00:00.000Z',
          capturedAt: '2026-06-20T00:00:01.000Z',
          storedOriginal: {
            blobId: 'external-blob-id',
            mimeType: 'image/jpeg',
            byteLength: 10,
            capturedAt: '2026-06-20T00:00:01.000Z',
          },
        },
      },
    ],
    now: '2026-06-20T00:00:00.000Z',
  });
  assert.ok(exportResult.status.ok, exportResult.status.message);

  const result = await importBookmarks(exportResult.fileContent!, '');
  assert.equal(result.status.ok, true);
  assert.equal(result.entries[0]?.payload.storedOriginal, undefined);
  assert.equal(result.entries[0]?.payload.capturedAt, undefined);
});

test('bookmarks-export: shift/plain export imports without password', async () => {
  const entries = [
    {
      uuid: 'plain-bookmark-1',
      payload: {
        url: 'https://example.test/plain-bookmark.webp',
        bookmarkedAt: '2026-06-18T00:00:00.000Z',
      },
    },
  ];

  const exportResult = exportPlainBookmarks({ entries, now: '2026-06-18T12:00:00.000Z' });
  assert.ok(exportResult.status.ok);
  assert.equal(exportResult.fileName, 'image-trail-bookmarks-2026-06-18.plain.json');
  assert.match(exportResult.fileContent!, /plain-bookmark\.webp/);

  const importResult = await importBookmarks(exportResult.fileContent!, '');
  assert.ok(importResult.status.ok, importResult.status.message);
  assert.equal(importResult.plaintext, true);
  assert.equal(importResult.entries[0]!.payload.url, 'https://example.test/plain-bookmark.webp');
});

test('bookmarks-export: preserves optional dimensions through plain import', async () => {
  const entries = [
    {
      uuid: 'plain-bookmark-with-dimensions',
      payload: {
        url: 'https://example.test/dimensions.jpg',
        bookmarkedAt: '2026-06-18T00:00:00.000Z',
        width: 2048,
        height: 1365,
      },
    },
  ];

  const exportResult = exportPlainBookmarks({ entries, now: '2026-06-18T12:00:00.000Z' });
  assert.ok(exportResult.status.ok, exportResult.status.message);

  const importResult = await importBookmarks(exportResult.fileContent!, '');
  assert.ok(importResult.status.ok, importResult.status.message);
  assert.equal(importResult.entries[0]!.payload.width, 2048);
  assert.equal(importResult.entries[0]!.payload.height, 1365);
});

test('bookmarks-export: encrypts large thumbnail payloads', async () => {
  const largeThumbnail = `data:image/jpeg;base64,${'a'.repeat(180_000)}`;
  const entries = [
    {
      uuid: 'large-bookmark-1',
      payload: {
        url: 'https://example.test/large.jpg',
        bookmarkedAt: '2026-06-18T00:00:00.000Z',
        thumbnail: largeThumbnail,
      },
    },
  ];

  const exportResult = await exportEncryptedBookmarks({ entries, password: 'bookmark-pass', now: '2026-06-18T12:00:00.000Z' });
  assert.ok(exportResult.status.ok, exportResult.status.message);

  const importResult = await importBookmarks(exportResult.fileContent!, 'bookmark-pass');
  assert.ok(importResult.status.ok, importResult.status.message);
  assert.equal(importResult.entries[0]!.payload.thumbnail, largeThumbnail);
});

test('recall: decrypts a single encrypted history record into visible payload', async () => {
  const session = await createSessionKey('history', 'recall-key', '2026-06-18T00:00:00.000Z');
  const payload: DurableHistoryPayloadV1 = {
    url: 'https://example.test/recall.jpg',
    capturedAt: '2026-06-18T00:00:00.000Z',
    captureStatus: 'remote-only',
    title: 'Recalled image',
  };

  const envelope = await sealJsonEnvelope({
    payload,
    payloadVersion: 1,
    key: session.key,
    keyReference: session.reference,
    authenticatedMetadata: { recordType: 'history' as const },
  });

  const result = await recallEncryptedRecord({
    uuid: 'recall-uuid',
    recordType: 'history',
    envelope,
    key: session.key,
  });

  assert.ok(result.status.ok);
  assert.equal(result.entry?.recordType, 'history');
  if (result.entry?.recordType === 'history') {
    assert.equal(result.entry.payload.url, 'https://example.test/recall.jpg');
    assert.equal(result.entry.payload.title, 'Recalled image');
  }
});

test('recall: batch recall reports partial failures', async () => {
  const session = await createSessionKey('history', 'batch-key', '2026-06-18T00:00:00.000Z');
  const wrongSession = await createSessionKey('history', 'wrong-key', '2026-06-18T00:00:00.000Z');

  const envelope = await sealJsonEnvelope({
    payload: { url: 'https://example.test/batch.jpg', capturedAt: '2026-06-18T00:00:00.000Z', captureStatus: 'remote-only' as const },
    payloadVersion: 1,
    key: session.key,
    keyReference: session.reference,
    authenticatedMetadata: { recordType: 'history' as const },
  });

  const result = await recallSelectedRecords([
    { uuid: 'good', recordType: 'history', envelope, key: session.key },
    { uuid: 'bad', recordType: 'history', envelope, key: wrongSession.key },
  ]);

  assert.equal(result.entries.length, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0], 'bad');
  assert.equal(result.status.code, 'decryption-failed');
});

test('key-export: rejects non-extractable keys without attempting export', async () => {
  const session = await createSessionKey('history', 'non-extractable-key');
  assert.equal(session.key.extractable, false);

  const result = await exportKeyWithPassword({
    key: session.key,
    keyReference: session.reference.reference,
    keyKind: 'history',
    password: 'test-password',
  });

  assert.equal(result.status.ok, false);
  assert.equal(result.status.code, 'encryption-failed');
  assert.ok(result.status.message.includes('not extractable'));
});

test('key-backup: exports and imports password-wrapped blob key records', async () => {
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'capture-password',
    uuid: '00000000-0000-4000-8000-000000000001',
    now: '2026-06-20T12:00:00.000Z',
  });

  const exportResult = await exportStoredKeyBackupWithPassword(wrapped.metadata, 'backup-password', '2026-06-20T13:00:00.000Z');
  assert.ok(exportResult.status.ok, exportResult.status.message);
  assert.equal(exportResult.fileName, 'image-trail-key-backup-blob-2026-06-20.json');

  const importResult = await importStoredKeyBackupWithPassword(exportResult.fileContent!, 'backup-password');
  assert.ok(importResult.status.ok, importResult.status.message);
  assert.equal(importResult.record?.reference, wrapped.metadata.reference);
  assert.equal(importResult.record?.kind, 'blob');
  assert.equal(importResult.record?.wrapping.wrappedKey, wrapped.metadata.wrapping.wrappedKey);
  assert.equal(importResult.record?.extractable, false);
  assert.equal(Object.hasOwn(importResult.record!, 'key'), false);
  const importedRecord = requireBlobKeyRecord(importResult.record);

  const active = await activateWrappedBlobKey(importedRecord, 'capture-password');
  assert.equal(active.reference.reference, wrapped.metadata.reference);
  assert.equal(active.key.extractable, false);
});

test('key-backup: rejects wrong backup password without returning a key record', async () => {
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'capture-password',
    uuid: '00000000-0000-4000-8000-000000000002',
  });
  const exportResult = await exportStoredKeyBackupWithPassword(wrapped.metadata, 'backup-password');

  const importResult = await importStoredKeyBackupWithPassword(exportResult.fileContent!, 'wrong-backup-password');

  assert.equal(importResult.status.ok, false);
  assert.equal(importResult.status.code, 'decryption-failed');
  assert.equal(importResult.record, undefined);
});

test('key-backup: rejects unsafe import iteration counts before decrypting', async () => {
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'capture-password',
    uuid: '00000000-0000-4000-8000-000000000004',
  });
  const exportResult = await exportStoredKeyBackupWithPassword(wrapped.metadata, 'backup-password');
  const tampered = JSON.parse(exportResult.fileContent!) as { header: { iterations: number } };
  tampered.header.iterations = 1;

  const importResult = await importStoredKeyBackupWithPassword(JSON.stringify(tampered), 'backup-password');

  assert.equal(importResult.status.ok, false);
  assert.equal(importResult.status.code, 'decryption-failed');
  assert.equal(importResult.status.message, 'Key backup has unsafe encryption parameters.');
  assert.equal(importResult.record, undefined);
});

test('key-backup: imported blob key decrypts payloads created before export', async () => {
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'capture-password',
    uuid: '00000000-0000-4000-8000-000000000003',
    now: '2026-06-20T12:00:00.000Z',
  });
  const aad = {
    id: 'blob-before-backup',
    kind: 'original' as const,
    schemaVersion: 1 as const,
    algorithm: 'AES-GCM' as const,
    createdAt: '2026-06-20T12:05:00.000Z',
    key: wrapped.active.reference,
  };
  const bytes = Uint8Array.from([5, 10, 15, 20]).buffer;
  const sealed = await sealBlobPayload({
    key: wrapped.active.key,
    aad,
    metadata: {
      mimeType: 'image/png',
      byteLength: 4,
      sourceUrl: 'https://example.test/original.png',
      capturedAt: '2026-06-20T12:05:00.000Z',
    },
    bytes,
  });
  const exportResult = await exportStoredKeyBackupWithPassword(wrapped.metadata, 'backup-password');
  const importResult = await importStoredKeyBackupWithPassword(exportResult.fileContent!, 'backup-password');
  assert.ok(importResult.status.ok, importResult.status.message);
  const importedRecord = requireBlobKeyRecord(importResult.record);

  const restored = await activateWrappedBlobKey(importedRecord, 'capture-password');
  const opened = await openBlobPayload({ key: restored.key, iv: sealed.iv, ciphertext: sealed.ciphertext, aad });

  assert.equal(opened.metadata.sourceUrl, 'https://example.test/original.png');
  assert.deepEqual(Array.from(new Uint8Array(opened.bytes)), [5, 10, 15, 20]);
});

test('full-backup: exports bookmarks with encrypted original blob records', async () => {
  const keyReference = createKeyReference('blob', 'full-backup-key');
  const ciphertext = Uint8Array.from({ length: 96_937 }, (_, index) => index % 251);
  const blobRecord: StoredBlobRecord = {
    id: 'blob-full-backup',
    kind: 'original',
    schemaVersion: 1,
    algorithm: 'AES-GCM',
    iv: 'iv-value',
    ciphertext: ciphertext.buffer,
    encryptedByteLength: ciphertext.byteLength,
    createdAt: '2026-06-28T00:00:00.000Z',
    key: keyReference,
    referenceCount: 1,
  };
  const exported = await exportEncryptedFullBackup({
    bookmarks: [
      {
        uuid: 'bookmark-full-backup',
        payload: {
          url: 'https://example.test/full.jpg',
          bookmarkedAt: '2026-06-28T00:00:00.000Z',
          storedOriginal: {
            blobId: 'blob-full-backup',
            mimeType: 'image/jpeg',
            byteLength: 123,
            capturedAt: '2026-06-28T00:00:00.000Z',
          },
        },
      },
    ],
    originalBlobs: [blobRecord],
    blobKeyBackups: [{ keyReference: 'blob:full-backup-key', fileContent: '{"header":{"payloadType":"keys"}}' }],
    password: 'backup-password',
    now: '2026-06-28T00:00:00.000Z',
  });

  assert.ok(exported.status.ok, exported.status.message);
  assert.equal(exported.originalBlobCount, 1);
  assert.ok(exported.fileContent!.length > ciphertext.byteLength, 'full backup file should include encrypted original bytes');
  const envelope = parseExportFile(exported.fileContent!);
  assert.equal(envelope.header.payloadType, 'mixed');
  assert.equal(envelope.header.recordCount, 1);

  const importedBookmarks = await importBookmarks(exported.fileContent!, 'backup-password');
  assert.ok(importedBookmarks.status.ok, importedBookmarks.status.message);
  assert.equal(importedBookmarks.fullBackup, true);
  assert.equal(importedBookmarks.entries.length, 1);
  assert.equal(importedBookmarks.externalOriginalCount, 1);
  assert.equal(importedBookmarks.originalBlobs.length, 1);
  assert.equal(importedBookmarks.blobKeyBackups.length, 1);
  assert.equal(importedBookmarks.entries[0]?.payload.storedOriginal?.blobId, 'blob-full-backup');

  const portable = portableStoredBlobRecord(blobRecord);
  const restored = storedBlobRecordFromPortable(portable);
  assert.equal(restored.id, blobRecord.id);
  assert.equal(restored.key.reference, 'blob:full-backup-key');
  assert.equal(restored.ciphertext.byteLength, ciphertext.byteLength);
  assert.deepEqual(Array.from(new Uint8Array(restored.ciphertext).slice(0, 4)), [0, 1, 2, 3]);
});

test('full-backup: rejects malformed original and key backup entries', () => {
  assert.equal(
    fullBackupPayloadFromUnknown({
      schemaVersion: 1,
      bookmarks: [],
      originalBlobs: [{ id: 'missing-fields' }],
      blobKeyBackups: [],
      missingOriginalBlobIds: ['missing-original'],
    }),
    null,
  );
  assert.equal(
    fullBackupPayloadFromUnknown({
      schemaVersion: 1,
      bookmarks: [],
      originalBlobs: [],
      blobKeyBackups: [{ keyReference: 'blob:key-without-content' }],
      missingOriginalBlobIds: ['missing-original'],
    }),
    null,
  );
});

test('full-backup: filters malformed missing original ids while preserving valid payloads', () => {
  const payload = fullBackupPayloadFromUnknown({
    schemaVersion: 1,
    bookmarks: [],
    originalBlobs: [],
    blobKeyBackups: [],
    missingOriginalBlobIds: ['missing-original', 42, null, 'other-missing-original'],
  });

  assert.ok(payload);
  assert.deepEqual(payload.missingOriginalBlobIds, ['missing-original', 'other-missing-original']);
});

test('full-backup: parseFullBackupPayload rejects a malformed corrupted-record fixture with structured issues', () => {
  const corrupted = {
    schemaVersion: 1,
    bookmarks: [],
    // originalBlobs carries a corrupted record: kind must be 'original' and the byte length a number.
    originalBlobs: [
      {
        id: 'blob-1',
        kind: 'thumbnail',
        schemaVersion: 1,
        algorithm: 'AES-GCM',
        iv: 'iv',
        ciphertext: 'AAAA',
        encryptedByteLength: 'not-a-number',
        createdAt: '2026-06-28T00:00:00.000Z',
        key: { kind: 'blob', uuid: 'k', reference: 'blob:k' },
        referenceCount: 1,
      },
    ],
    blobKeyBackups: [],
    missingOriginalBlobIds: [],
  };

  const result = parseFullBackupPayload(corrupted);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'invalid-full-backup');
    assert.ok(result.issues.length >= 1);
    assert.ok(result.issues.some((issue) => issue.includes('originalBlobs')));
  }

  // A structurally valid payload still round-trips through the thin wrapper.
  assert.ok(fullBackupPayloadFromUnknown({ schemaVersion: 1, bookmarks: [], originalBlobs: [], blobKeyBackups: [] }));
});

test('full-backup: a corrupted bookmark entry is skipped, not fatal, on import', async () => {
  const exported = await exportEncryptedFullBackup({
    bookmarks: [
      { uuid: 'valid', payload: { url: 'https://example.test/valid.jpg', bookmarkedAt: '2026-06-28T00:00:00.000Z' } },
      // Corrupted entry: payload is missing the required `url`.
      { uuid: 'corrupt', payload: { bookmarkedAt: '2026-06-28T00:00:00.000Z' } as never },
    ],
    originalBlobs: [],
    password: 'backup-password',
    now: '2026-06-28T00:00:00.000Z',
  });

  assert.ok(exported.status.ok, exported.status.message);
  const imported = await importBookmarks(exported.fileContent!, 'backup-password');

  assert.ok(imported.status.ok, imported.status.message);
  assert.equal(imported.fullBackup, true);
  assert.equal(imported.entries.length, 1);
  assert.equal(imported.entries[0]?.uuid, 'valid');
  assert.equal(imported.skipped.length, 1);
  assert.equal(imported.validationReport.rejectedCount, 1);
  assert.ok(imported.validationReport.reasons[0]!.reason.includes('url'));
});

test('full-backup: strips original references whose encrypted bytes are missing', async () => {
  const exported = await exportEncryptedFullBackup({
    bookmarks: [
      {
        uuid: 'bookmark-missing-original',
        payload: {
          url: 'https://example.test/missing.jpg',
          bookmarkedAt: '2026-06-28T00:00:00.000Z',
          capturedAt: '2026-06-28T00:00:00.000Z',
          storedOriginal: {
            blobId: 'missing-original',
            mimeType: 'image/jpeg',
            byteLength: 123,
            capturedAt: '2026-06-28T00:00:00.000Z',
          },
          protectedPin: {
            schemaVersion: 1,
            plainPinId: 'plain-pin',
            storedOriginalBlobId: 'missing-original',
            queueUpdatedAt: '2026-06-28T00:00:00.000Z',
            hasEncryptedMetadata: false,
            hasEncryptedThumbnail: false,
            hasStoredOriginal: true,
          },
        },
      },
    ],
    originalBlobs: [],
    missingOriginalBlobIds: ['missing-original', 'missing-original'],
    password: 'backup-password',
    now: '2026-06-28T00:00:00.000Z',
  });

  assert.ok(exported.status.ok, exported.status.message);
  const imported = await importBookmarks(exported.fileContent!, 'backup-password');

  assert.ok(imported.status.ok, imported.status.message);
  assert.equal(imported.fullBackup, true);
  assert.equal(imported.externalOriginalCount, 0);
  assert.equal(imported.entries[0]?.payload.storedOriginal, undefined);
  assert.equal(imported.entries[0]?.payload.capturedAt, undefined);
  assert.equal(imported.entries[0]?.payload.protectedPin?.storedOriginalBlobId, undefined);
  assert.equal(imported.entries[0]?.payload.protectedPin?.hasStoredOriginal, false);
  assert.deepEqual(imported.missingOriginalBlobIds, ['missing-original', 'missing-original']);
});

test('encrypted-image: exports and imports bytes with the blob key', async () => {
  const key = await generateAesGcmKey(false);
  const keyReference = createKeyReference('blob', 'image-key');
  const bytes = new Uint8Array([1, 2, 3, 4]).buffer;

  const exported = await createEncryptedImageFile({
    bytes,
    mimeType: 'image/png',
    sourceUrl: 'https://example.test/photo.png',
    fileName: 'photo.png',
    key,
    keyReference,
    now: '2026-06-20T00:00:00.000Z',
  });

  assert.equal(exported.fileName, 'photo.png.image-trail-encrypted.json');
  const envelope = parseExportFile(exported.fileContent);
  assert.equal(envelope.header.payloadType, 'image');
  assert.equal(envelope.header.keyKind, 'blob');
  assert.equal(envelope.header.keyReference, 'blob:image-key');
  assert.equal(envelope.header.wrappingMode, 'indexeddb');

  const imported = await openEncryptedImageFile(exported.fileContent, key, keyReference.reference);
  assert.equal(imported.mimeType, 'image/png');
  assert.equal(imported.sourceUrl, 'https://example.test/photo.png');
  assert.equal(imported.fileName, 'photo.png');
  assert.deepEqual(Array.from(imported.bytes), [1, 2, 3, 4]);
});

test('encrypted-image: rejects tampered payloads and wrong keys', async () => {
  const key = await generateAesGcmKey(false);
  const wrongKey = await generateAesGcmKey(false);
  const keyReference = createKeyReference('blob', 'image-key');
  const exported = await createEncryptedImageFile({
    bytes: new Uint8Array([5, 6, 7]).buffer,
    mimeType: 'image/jpeg',
    sourceUrl: 'https://example.test/photo.jpg',
    fileName: 'photo.jpg',
    key,
    keyReference,
  });
  const envelope = parseExportFile(exported.fileContent);
  const tampered = serializeExportFile({ ...envelope, payload: `${envelope.payload.slice(0, -4)}AAAA` });

  await assert.rejects(openEncryptedImageFile(tampered, key, keyReference.reference));
  await assert.rejects(openEncryptedImageFile(exported.fileContent, wrongKey, keyReference.reference));
  await assert.rejects(openEncryptedImageFile(exported.fileContent, key, 'blob:other-key'), /Unlock blob:image-key/u);
});

test('encrypted-image: rejects non-image export JSON before decrypting', async () => {
  const key = await generateAesGcmKey(false);
  const keyReference = createKeyReference('blob', 'image-key');
  const historyExport = await exportEncryptedHistory({
    entries: [
      {
        uuid: 'history-1',
        payload: {
          url: 'https://example.test/photo.jpg',
          capturedAt: '2026-06-20T00:00:00.000Z',
          captureStatus: 'remote-only',
        },
      },
    ],
    password: 'history-password',
    now: '2026-06-20T00:00:00.000Z',
  });

  assert.ok(historyExport.status.ok);
  assert.ok(historyExport.fileContent);
  assert.throws(() => parseEncryptedImageFileHeader(historyExport.fileContent!), /Unexpected payload type: history/u);
  await assert.rejects(openEncryptedImageFile(historyExport.fileContent, key, keyReference.reference), /Unexpected payload type: history/u);
});

test('history-import: skips entries with missing captureStatus', async () => {
  const exportResult = await exportEncryptedHistory({
    entries: [
      {
        uuid: 'valid-entry',
        payload: { url: 'https://example.test/valid.jpg', capturedAt: '2026-06-18T00:00:00.000Z', captureStatus: 'remote-only' as const },
      },
      {
        uuid: 'invalid-entry',
        payload: { url: 'https://example.test/invalid.jpg', capturedAt: '2026-06-18T00:00:00.000Z' } as DurableHistoryPayloadV1,
      },
    ],
    password: 'test-pass',
  });

  const importResult = await importEncryptedHistory(exportResult.fileContent!, 'test-pass');
  assert.ok(importResult.status.ok);
  assert.equal(importResult.entries.length, 1);
  assert.equal(importResult.entries[0]!.uuid, 'valid-entry');
  assert.equal(importResult.skipped.length, 1);
  assert.equal(importResult.validationReport.rejectedCount, 1);
  assert.equal(importResult.validationReport.reasons.length, 1);
  // Structured, privacy-safe reason: names the offending field, never leaks the record URL.
  assert.match(importResult.validationReport.reasons[0]!.reason, /captureStatus/u);
  assert.equal(importResult.validationReport.reasons[0]!.count, 1);
  assert.ok(!importResult.validationReport.reasons[0]!.reason.includes('example.test'));
});

test('bookmarks-import: reports rejected records by privacy-safe reason', async () => {
  const exportResult = await exportEncryptedBookmarks({
    entries: [
      {
        uuid: 'valid-bookmark',
        payload: { url: 'https://example.test/valid.jpg', bookmarkedAt: '2026-06-18T00:00:00.000Z' },
      },
      {
        uuid: 'missing-url',
        payload: { bookmarkedAt: '2026-06-18T00:00:00.000Z' } as DurableBookmarkPayloadV1,
      },
      {
        uuid: 'missing-time',
        payload: { url: 'https://example.test/missing-time.jpg' } as DurableBookmarkPayloadV1,
      },
    ],
    password: 'test-pass',
  });

  const importResult = await importBookmarks(exportResult.fileContent!, 'test-pass');
  assert.ok(importResult.status.ok);
  assert.equal(importResult.entries.length, 1);
  assert.deepEqual(importResult.skipped, ['missing-url', 'missing-time']);
  assert.equal(importResult.validationReport.rejectedCount, 2);
  const bookmarkReasons = importResult.validationReport.reasons.map((entry) => entry.reason);
  // Structured reasons name each offending field; they stay privacy-safe (no record URL).
  assert.ok(bookmarkReasons.some((reason) => reason.includes('url')));
  assert.ok(bookmarkReasons.some((reason) => reason.includes('bookmarkedAt')));
  assert.ok(bookmarkReasons.every((reason) => !reason.includes('example.test')));
});

test('url-review-status: exports and imports reviewed URL state', () => {
  const records = [
    {
      schemaVersion: 1 as const,
      hostname: 'example.test',
      pageUrl: 'https://example.test/gallery',
      sourceUrl: 'https://example.test/image-0002.jpg',
      status: 'passed' as const,
      fieldIds: ['path:0:0'],
      activeFieldId: 'path:0:0',
      updatedAt: '2026-06-23T00:00:00.000Z',
    },
    {
      schemaVersion: 1 as const,
      hostname: 'example.test',
      pageUrl: 'https://example.test/gallery',
      sourceUrl: 'https://example.test/image-0003.jpg',
      status: 'failed' as const,
      fieldIds: ['path:0:0'],
      activeFieldId: 'path:0:0',
      reason: 'Image failed to load: HTTP 404',
      updatedAt: '2026-06-23T00:00:01.000Z',
    },
  ];

  const exported = exportUrlReviewStatus({ records, now: '2026-06-23T12:00:00.000Z' });
  assert.ok(exported.status.ok, exported.status.message);
  assert.equal(exported.fileName, 'image-trail-url-review-status-2026-06-23.json');

  const imported = importUrlReviewStatus(exported.fileContent!);
  assert.ok(imported.status.ok, imported.status.message);
  assert.deepEqual(imported.records, records);
  assert.deepEqual(imported.skipped, []);
});

test('url-review-status: skips invalid imported status records', () => {
  const fileContent = JSON.stringify({
    format: 'image-trail.url-review-status',
    formatVersion: 1,
    createdAt: '2026-06-23T00:00:00.000Z',
    recordCount: 2,
    records: [
      {
        schemaVersion: 1,
        hostname: 'example.test',
        pageUrl: 'https://example.test/gallery',
        sourceUrl: 'https://example.test/image-0002.jpg',
        status: 'unchanged',
        fieldIds: ['path:0:0'],
        activeFieldId: null,
        updatedAt: '2026-06-23T00:00:00.000Z',
      },
      {
        schemaVersion: 1,
        hostname: 'example.test',
        pageUrl: 'https://example.test/gallery',
        sourceUrl: 'https://example.test/image-0003.jpg',
        status: 'maybe',
        fieldIds: ['path:0:0'],
        activeFieldId: null,
        updatedAt: '2026-06-23T00:00:00.000Z',
      },
    ],
  });

  const imported = importUrlReviewStatus(fileContent);
  assert.ok(imported.status.ok, imported.status.message);
  assert.equal(imported.records.length, 1);
  assert.equal(imported.records[0]?.status, 'unchanged');
  assert.deepEqual(imported.skipped, ['redacted']);
  assert.equal(imported.validationReport.rejectedCount, 1);
  assert.equal(imported.validationReport.reasons.length, 1);
  // The invalid record has a bad `status`; the structured reason names that field.
  assert.match(imported.validationReport.reasons[0]!.reason, /status/u);
});

test('encrypted-file-format: header contains all required metadata fields', () => {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  const header = buildExportFileHeader({
    payloadType: 'history',
    algorithm: 'AES-GCM',
    wrappingMode: 'password',
    keyKind: 'export',
    keyReference: 'export:meta-test',
    salt,
    iv,
    iterations: 600_000,
    recordCount: 3,
    now: '2026-06-18T00:00:00.000Z',
  });

  assert.equal(typeof header.salt, 'string');
  assert.equal(typeof header.iv, 'string');
  assert.equal(header.algorithm, 'AES-GCM');
  assert.equal(header.wrappingMode, 'password');
  assert.equal(header.keyKind, 'export');
  assert.equal(header.iterations, 600_000);
  assert.equal(header.recordCount, 3);
});
