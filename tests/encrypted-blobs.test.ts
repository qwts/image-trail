import test from 'node:test';
import assert from 'node:assert/strict';
import { createAndActivateWrappedBlobKey, lockBlobKey, activateWrappedBlobKey, getActiveBlobKey } from '../extension/src/data/crypto/blob-keyring.js';
import { sealBlobPayload, openBlobPayload } from '../extension/src/data/crypto/binary-envelope.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';

function bytes(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

function text(value: ArrayBuffer): string {
  return new TextDecoder().decode(value);
}

test('blob key wrapping stores salt, wrap IV, and no raw key material', async () => {
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'capture-password',
    uuid: 'blob-key-test',
    now: '2026-06-19T00:00:00.000Z',
  });

  assert.equal(wrapped.metadata.kind, 'blob');
  assert.equal(wrapped.metadata.reference, 'blob:blob-key-test');
  assert.equal(wrapped.metadata.wrapping.mode, 'password');
  assert.equal(wrapped.metadata.wrapping.algorithm, 'AES-GCM');
  assert.ok(wrapped.metadata.wrapping.salt);
  assert.ok(wrapped.metadata.wrapping.iv);
  assert.ok(wrapped.metadata.wrapping.wrappedKey);
  assert.equal(wrapped.metadata.wrapping.iterations, 600_000);
  assert.equal(wrapped.metadata.extractable, false);
  assert.equal(wrapped.active.key.extractable, false);
});

test('wrapped blob keys can be reactivated as non-extractable active keys', async () => {
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'capture-password',
    uuid: 'reactivate-key',
    now: '2026-06-19T00:00:00.000Z',
  });

  lockBlobKey();
  assert.equal(getActiveBlobKey(), null);

  const active = await activateWrappedBlobKey(wrapped.metadata, 'capture-password');
  assert.equal(active.reference.reference, 'blob:reactivate-key');
  assert.equal(active.key.extractable, false);
});

test('encrypted blob payload round-trips bytes and encrypted metadata', async () => {
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'capture-password',
    uuid: 'payload-key',
    now: '2026-06-19T00:00:00.000Z',
  });
  const aad = {
    id: 'blob-1',
    kind: 'original' as const,
    schemaVersion: 1 as const,
    algorithm: 'AES-GCM' as const,
    createdAt: '2026-06-19T00:00:01.000Z',
    key: wrapped.active.reference,
  };
  const metadata = {
    mimeType: 'image/jpeg',
    byteLength: 11,
    sourceUrl: 'https://example.test/secret.jpg',
    capturedAt: '2026-06-19T00:00:02.000Z',
  };

  const sealed = await sealBlobPayload({
    key: wrapped.active.key,
    aad,
    metadata,
    bytes: bytes('hello image'),
  });

  const ciphertextText = text(sealed.ciphertext);
  assert.equal(ciphertextText.includes('secret.jpg'), false);
  assert.equal(ciphertextText.includes('hello image'), false);

  const opened = await openBlobPayload({ key: wrapped.active.key, iv: sealed.iv, ciphertext: sealed.ciphertext, aad });
  assert.deepEqual(opened.metadata, metadata);
  assert.equal(text(opened.bytes), 'hello image');
});

test('encrypted blob payload rejects authenticated metadata tampering', async () => {
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'capture-password',
    uuid: 'tamper-key',
    now: '2026-06-19T00:00:00.000Z',
  });
  const aad = {
    id: 'blob-1',
    kind: 'original' as const,
    schemaVersion: 1 as const,
    algorithm: 'AES-GCM' as const,
    createdAt: '2026-06-19T00:00:01.000Z',
    key: wrapped.active.reference,
  };
  const sealed = await sealBlobPayload({
    key: wrapped.active.key,
    aad,
    metadata: {
      mimeType: 'image/png',
      byteLength: 7,
      sourceUrl: 'https://example.test/a.png',
      capturedAt: '2026-06-19T00:00:02.000Z',
    },
    bytes: bytes('payload'),
  });

  await assert.rejects(
    openBlobPayload({
      key: wrapped.active.key,
      iv: sealed.iv,
      ciphertext: sealed.ciphertext,
      aad: { ...aad, key: createKeyReference('blob', 'other-key') },
    }),
  );
});

