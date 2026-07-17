import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

import { openImageTrailDb } from '../extension/src/data/db.js';
import { importInteropPairingBundle } from '../extension/src/data/interop/pairing-import.js';
import { openInteropBlob, sealInteropBlob } from '../extension/src/data/interop/sealed-blob.js';
import { InteropKeysRepository } from '../extension/src/data/repositories/interop-keys-repository.js';

const TRANSFER_ID = '11111111-1111-4111-8111-111111111111';
const INTEROP_ID = '22222222-2222-4222-8222-222222222222';

test('sealed interop original binds identity, metadata, hash, and exact bytes', async (t) => {
  const opened = await openImageTrailDb(new IDBFactory());
  assert.ok(opened.db);
  t.after(() => opened.db?.close());
  await importInteropPairingBundle({
    db: opened.db,
    bundle: JSON.parse(readFileSync('contracts/interop/v1/fixtures/valid-pairing-bundle.json', 'utf8')) as unknown,
    password: 'fixture-password',
  });
  const pairing = (await new InteropKeysRepository(opened.db).list())[0];
  assert.ok(pairing);
  const bytes = new TextEncoder().encode('pairing-key encrypted original bytes');
  const blob = {
    state: 'available' as const,
    blobId: 'source-blob-1',
    mimeType: 'image/jpeg',
    byteLength: bytes.byteLength,
    contentHash: '0371f308fa6ea8c4f0bc120e8bdffb029550caa156b2b0bb1846c7745aa74add',
  };
  const sealed = await sealInteropBlob({ pairing, transferId: TRANSFER_ID, recordInteropId: INTEROP_ID, blob, bytes });
  const providerVisible = new TextDecoder().decode(sealed);
  assert.doesNotMatch(providerVisible, /0371f308|source-blob-1|image\/jpeg/u);
  const result = await openInteropBlob(sealed, pairing);
  assert.equal(result.descriptor.transferId, TRANSFER_ID);
  assert.equal(result.descriptor.recordInteropId, INTEROP_ID);
  assert.equal(result.descriptor.contentHash, blob.contentHash);
  assert.deepEqual(result.bytes, bytes);
  result.bytes.fill(0);
  const corrupted = sealed.slice();
  corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 1;
  await assert.rejects(openInteropBlob(corrupted, pairing), /could not be opened/u);
});
