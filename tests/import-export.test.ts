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
import {
  buildExportFileHeader,
  serializeExportFile,
  parseExportFile,
  validateExportFileHeader,
  EXPORT_FORMAT_MAGIC,
  EXPORT_FORMAT_VERSION,
} from '../extension/src/data/import-export/encrypted-file-format.js';
import { exportEncryptedHistory } from '../extension/src/data/import-export/history-export.js';
import { importEncryptedHistory } from '../extension/src/data/import-export/history-import.js';
import { importBookmarkletJson } from '../extension/src/data/import-export/bookmarklet-import.js';
import { recallEncryptedRecord, recallSelectedRecords } from '../extension/src/data/import-export/recall.js';
import { exportKeyWithPassword } from '../extension/src/data/import-export/key-export.js';
import { createSessionKey } from '../extension/src/data/crypto/keyring.js';
import { sealJsonEnvelope } from '../extension/src/data/crypto/envelope.js';
import type { DurableHistoryPayloadV1 } from '../extension/src/data/types.js';

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

  const unwrapped = await unwrapKeyWithPassword(wrapped.wrappedKey, wrapped.iv, 'my-password', wrapped.salt, wrapped.iterations);
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
  assert.equal(importResult.entries[0].payload.url, 'https://example.test/001.jpg');
  assert.equal(importResult.entries[1].payload.title, 'Second image');
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

test('bookmarklet-import: imports favorites and deduplicates URLs', () => {
  const json = JSON.stringify({
    favorites: [
      { url: 'https://example.test/a.jpg', title: 'Image A' },
      { url: 'https://example.test/b.jpg' },
      { url: 'https://example.test/a.jpg', title: 'Duplicate A' },
    ],
    history: [{ url: 'https://example.test/c.jpg', title: 'History C' }],
  });

  const result = importBookmarkletJson(json, '2026-06-18T00:00:00.000Z');
  assert.ok(result.status.ok);
  assert.equal(result.bookmarks.length, 3);
  assert.equal(result.bookmarks[0].payload.url, 'https://example.test/a.jpg');
  assert.equal(result.bookmarks[0].payload.sourceCompatibility, 'favorites');
  assert.equal(result.skipped.length, 0);
});

test('bookmarklet-import: skips invalid URLs', () => {
  const json = JSON.stringify({
    favorites: [{ url: 'https://example.test/valid.jpg' }, { url: 'not-a-url' }, { url: '' }],
  });

  const result = importBookmarkletJson(json);
  assert.ok(result.status.ok);
  assert.equal(result.bookmarks.length, 1);
  assert.equal(result.skipped.length, 2);
});

test('bookmarklet-import: rejects invalid JSON', () => {
  const result = importBookmarkletJson('not-json');
  assert.equal(result.status.ok, false);
});

test('bookmarklet-import: rejects empty data', () => {
  const result = importBookmarkletJson(JSON.stringify({ unrelated: true }));
  assert.equal(result.status.ok, false);
  assert.equal(result.status.code, 'not-found');
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
  assert.equal(importResult.entries[0].uuid, 'valid-entry');
  assert.equal(importResult.skipped.length, 1);
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
