import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDisplayRecord,
  displayTitleForRecord,
  encryptedBlobIdForRecord,
  imageExtensionFromUrl,
  isDurableImageSourceUrl,
  normalizeDisplayLabel,
  sourceImageUrlFrom,
  validateImageRecordUrl,
} from '../extension/src/core/display-records.js';

test('uses source image filename from DuckDuckGo image proxy URLs', () => {
  const source = 'https://cdn.example.test/images/korn-live-1999.jpg';
  const proxy = `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(source)}&f=1&nofb=1`;

  assert.equal(normalizeDisplayLabel({ url: proxy }), 'korn-live-1999.jpg');
});

test('keeps explicit display labels before deriving a filename', () => {
  assert.equal(
    normalizeDisplayLabel({ url: 'https://example.test/iu/?u=https%3A%2F%2Fcdn.test%2Fimage.jpg', label: 'Favorite' }),
    'Favorite',
  );
});

test('unwraps source image URLs from proxy query parameters', () => {
  const source = 'https://cdn.example.test/images/korn-live-1999.jpg';
  const proxy = `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(source)}&f=1&nofb=1`;

  assert.equal(sourceImageUrlFrom(proxy).href, source);
});

test('durable image source URLs reject blob preview URLs', () => {
  assert.equal(isDurableImageSourceUrl('https://example.test/photo.jpg'), true);
  assert.equal(isDurableImageSourceUrl('http://example.test/photo.jpg'), true);
  assert.equal(isDurableImageSourceUrl('blob:https://example.test/preview-id'), false);
  assert.equal(isDurableImageSourceUrl('data:image/png;base64,abc'), false);
});

test('encrypted blob id is only active for captured records', () => {
  assert.equal(encryptedBlobIdForRecord({ captureStatus: 'captured', blobId: 'blob-1' }), 'blob-1');
  assert.equal(encryptedBlobIdForRecord({ blobId: 'stale-blob' }), undefined);
  assert.equal(encryptedBlobIdForRecord({ captureStatus: 'remote-only', blobId: 'remote-blob' }), undefined);
});

test('image extension detection supports image service format hints', () => {
  assert.equal(imageExtensionFromUrl('https://example.test/photo.jpeg'), 'JPEG');
  assert.equal(imageExtensionFromUrl('https://pbs.twimg.com/media/example?format=jpg&name=large'), 'JPG');
  assert.equal(imageExtensionFromUrl('https://images.example.test/render?mime=image%2Fwebp'), 'WEBP');
  assert.equal(imageExtensionFromUrl('data:image/png;base64,abc'), 'PNG');
});

test('data image display records keep DOM labels, titles, and generated ids bounded', () => {
  const dataUrl = `data:image/png;base64,${'a'.repeat(20_000)}`;
  const record = createDisplayRecord({ url: dataUrl, timestamp: '2026-06-20T00:00:00.000Z' });

  assert.equal(record.label, 'Data URL image (PNG)');
  assert.equal(record.id, '2026-06-20T00:00:00.000Z:data:image-png:20022');
  assert.equal(displayTitleForRecord(record), 'Data URL image (PNG)');
  assert.ok(record.id.length < 80);
});

test('image record URL validation rejects invalid transport before load probing', () => {
  assert.deepEqual(validateImageRecordUrl('https://example.test/photo.png'), {
    ok: true,
    sourceUrl: 'https://example.test/photo.png',
  });
  assert.deepEqual(validateImageRecordUrl('https://example.test/gallery/page'), {
    ok: true,
    sourceUrl: 'https://example.test/gallery/page',
  });
  const wrapped = 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.example.test%2Fphoto.jpg&f=1';
  assert.deepEqual(validateImageRecordUrl(wrapped), {
    ok: true,
    sourceUrl: wrapped,
  });

  const invalid = validateImageRecordUrl('not a url');
  assert.equal(invalid.ok, false);
  assert.match(invalid.message ?? '', /not a valid URL/i);

  const nonHttp = validateImageRecordUrl('data:image/png;base64,abc');
  assert.equal(nonHttp.ok, false);
  assert.match(nonHttp.message ?? '', /http\(s\)/i);
});
