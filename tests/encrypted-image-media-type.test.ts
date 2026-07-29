import assert from 'node:assert/strict';
import test from 'node:test';

import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { generateAesGcmKey } from '../extension/src/data/crypto/webcrypto.js';
import { createEncryptedImageFile } from '../extension/src/data/import-export/encrypted-image.js';

test('encrypted image exports reject video originals before serialization', async () => {
  await assert.rejects(
    createEncryptedImageFile({
      bytes: new Uint8Array([0x47]).buffer,
      mimeType: 'video/mp2t',
      sourceUrl: 'image-trail://local-media/video/clip.ts',
      fileName: 'clip.ts',
      key: await generateAesGcmKey(false),
      keyReference: createKeyReference('blob', 'video-key'),
    }),
    /supports image originals only/u,
  );
});
