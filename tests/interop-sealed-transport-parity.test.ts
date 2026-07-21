import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseInteropEnvelope } from '../extension/src/core/interop/messages.js';
import { openInteropBlob, sealInteropBlob } from '../extension/src/data/interop/sealed-blob.js';
import { openInteropMessage, sealInteropMessage } from '../extension/src/data/interop/sealed-message.js';
import type { StoredInteropKeyRecord } from '../extension/src/data/repositories/interop-keys-repository.js';

interface GoldenTransportFixture {
  readonly key: { readonly pairingId: string; readonly keyId: `interop:${string}`; readonly interopKey: string };
  readonly iv: string;
  readonly message: { readonly envelope: unknown; readonly sealed: string };
  readonly blob: {
    readonly descriptor: {
      readonly transferId: string;
      readonly recordInteropId: string;
      readonly blobId: string;
      readonly mimeType: string;
      readonly byteLength: number;
      readonly contentHash: string;
    };
    readonly original: string;
    readonly sealed: string;
  };
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function goldenFixture(): GoldenTransportFixture {
  return JSON.parse(readFileSync('contracts/interop/v1/fixtures/sealed-transport.json', 'utf8')) as GoldenTransportFixture;
}

function deterministicCrypto(iv: Uint8Array): Crypto {
  return {
    subtle: globalThis.crypto.subtle,
    randomUUID: globalThis.crypto.randomUUID.bind(globalThis.crypto),
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
      if (array === null) throw new TypeError('Expected a typed array.');
      const target = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      if (target.byteLength !== iv.byteLength) throw new Error('Unexpected random byte request.');
      target.set(iv);
      return array;
    },
  };
}

async function pairing(fixture: GoldenTransportFixture): Promise<StoredInteropKeyRecord> {
  const uuid = fixture.key.keyId.slice('interop:'.length);
  return {
    kind: 'interop',
    uuid,
    reference: fixture.key.keyId,
    pairingId: fixture.key.pairingId,
    createdAt: '2026-07-16T10:00:00.000Z',
    updatedAt: '2026-07-16T10:00:00.000Z',
    wrapping: { mode: 'indexeddb', algorithm: 'none' },
    extractable: false,
    key: await globalThis.crypto.subtle.importKey('raw', fromBase64(fixture.key.interopKey) as BufferSource, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]),
  };
}

test('Image Trail matches Photos canonical sealed message and blob bytes', async () => {
  const fixture = goldenFixture();
  const key = await pairing(fixture);
  const crypto = deterministicCrypto(fromBase64(fixture.iv));
  const envelope = parseInteropEnvelope(fixture.message.envelope);

  const message = await sealInteropMessage(envelope, key, crypto);
  assert.equal(toBase64(message), fixture.message.sealed);
  assert.deepEqual(await openInteropMessage(fromBase64(fixture.message.sealed), key), envelope);

  const original = fromBase64(fixture.blob.original);
  const descriptor = fixture.blob.descriptor;
  const blob = await sealInteropBlob({
    pairing: key,
    transferId: descriptor.transferId,
    recordInteropId: descriptor.recordInteropId,
    blob: {
      state: 'available',
      blobId: descriptor.blobId,
      mimeType: descriptor.mimeType,
      byteLength: descriptor.byteLength,
      contentHash: descriptor.contentHash,
    },
    bytes: original,
    crypto,
  });
  assert.equal(toBase64(blob), fixture.blob.sealed);
  const opened = await openInteropBlob(fromBase64(fixture.blob.sealed), key);
  assert.deepEqual(opened.bytes, original);
  assert.deepEqual(opened.descriptor, descriptor);
  opened.bytes.fill(0);
  original.fill(0);
});

test('Image Trail rejects padded Base64 that masks a non-96-bit IV', async () => {
  const fixture = goldenFixture();
  const key = await pairing(fixture);
  const message = JSON.parse(Buffer.from(fixture.message.sealed, 'base64').toString('utf8')) as {
    cipher: { iv: string };
  };
  message.cipher.iv = Buffer.alloc(10).toString('base64');
  await assert.rejects(openInteropMessage(new TextEncoder().encode(JSON.stringify(message)), key), /message is invalid/u);

  const blob = fromBase64(fixture.blob.sealed);
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const headerLength = view.getUint32(0, false);
  const header = JSON.parse(new TextDecoder().decode(blob.slice(4, 4 + headerLength))) as { cipher: { iv: string } };
  header.cipher.iv = Buffer.alloc(10).toString('base64');
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const malformedBlob = new Uint8Array(4 + headerBytes.byteLength + blob.byteLength - 4 - headerLength);
  new DataView(malformedBlob.buffer).setUint32(0, headerBytes.byteLength, false);
  malformedBlob.set(headerBytes, 4);
  malformedBlob.set(blob.slice(4 + headerLength), 4 + headerBytes.byteLength);
  await assert.rejects(openInteropBlob(malformedBlob, key), /blob header is invalid/u);
});
