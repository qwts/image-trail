import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MessageType,
  createExportEncryptedImageMessage,
  createExportEncryptedImageResultMessage,
  createImportEncryptedImageMessage,
  createImportEncryptedImageResultMessage,
  isExportEncryptedImageResultMessage,
  isExtensionRequest,
  isExtensionResponse,
  isImportEncryptedImageResultMessage,
} from '../extension/src/background/messages.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';

test('encrypted image import and export messages keep protected import bytes out of the response', () => {
  const exportRequest = createExportEncryptedImageMessage('https://cdn.example.com/photo.jpg', 'photo.jpg', 'blob-1');
  assert.equal(exportRequest.type, MessageType.ExportEncryptedImage);
  assert.equal(exportRequest.payload.blobId, 'blob-1');
  assert.equal(isExtensionRequest(exportRequest), true);

  const exportResult = createExportEncryptedImageResultMessage({
    ok: true,
    fileContent: '{"header":{}}',
    fileName: 'photo.jpg.image-trail-encrypted.json',
    message: 'Encrypted image export prepared.',
  });
  assert.equal(isExtensionResponse(exportResult), true);
  assert.equal(isExportEncryptedImageResultMessage(exportResult), true);

  const importRequest = createImportEncryptedImageMessage('{"header":{}}');
  assert.equal(importRequest.type, MessageType.ImportEncryptedImage);
  assert.equal(isExtensionRequest(importRequest), true);

  const importResult = createImportEncryptedImageResultMessage({
    ok: true,
    fileName: 'photo.png',
    record: createDisplayRecord({
      id: 'pin-imported',
      url: 'image-trail-private:blob-imported',
      source: 'bookmark',
      captureStatus: 'captured',
      blobId: 'blob-imported',
      storedOriginal: {
        blobId: 'blob-imported',
        mimeType: 'image/png',
        byteLength: 3,
        capturedAt: '2026-07-20T00:00:00.000Z',
      },
    }),
  });
  assert.equal(importResult.type, MessageType.ImportEncryptedImageResult);
  assert.equal(isExtensionResponse(importResult), true);
  assert.equal(isImportEncryptedImageResultMessage(importResult), true);
  assert.equal(JSON.stringify(importResult).includes('data:image'), false);
});
