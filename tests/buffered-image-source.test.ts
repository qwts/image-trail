import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_PROTOCOL_VERSION, MessageType, isFetchBufferedImageSourceResultMessage } from '../extension/src/background/messages.js';
import { imageBlobFromDataUrl } from '../extension/src/content/buffered-image-source.js';

test('buffered image runtime payloads survive JSON transport without ArrayBuffer loss', () => {
  const serializedResult: unknown = JSON.parse(
    JSON.stringify({
      type: MessageType.FetchBufferedImageSourceResult,
      version: MESSAGE_PROTOCOL_VERSION,
      payload: {
        ok: true,
        dataUrl: 'data:image/png;base64,AQID',
        mimeType: 'image/png',
        byteLength: 3,
        sha256: 'b'.repeat(64),
      },
    }),
  );
  assert.equal(isFetchBufferedImageSourceResultMessage(serializedResult), true);

  const lostArrayBufferResult: unknown = JSON.parse(
    JSON.stringify({
      type: MessageType.FetchBufferedImageSourceResult,
      version: MESSAGE_PROTOCOL_VERSION,
      payload: { ok: true, bytes: new ArrayBuffer(3), mimeType: 'image/png', byteLength: 3 },
    }),
  );
  assert.equal(isFetchBufferedImageSourceResultMessage(lostArrayBufferResult), false);
});

test('buffered image data URLs decode after a JSON-shaped runtime round trip', async () => {
  const serialized = JSON.stringify({ dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png' });
  const payload = JSON.parse(serialized) as { readonly dataUrl: string; readonly mimeType: string };

  const blob = imageBlobFromDataUrl(payload.dataUrl, payload.mimeType);

  assert.ok(blob);
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test('buffered image data URL decoding rejects malformed or mismatched payloads', () => {
  assert.equal(imageBlobFromDataUrl('data:image/png;base64,%%%%', 'image/png'), null);
  assert.equal(imageBlobFromDataUrl('data:image/jpeg;base64,AQID', 'image/png'), null);
});
