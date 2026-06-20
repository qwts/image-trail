import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  assert.equal(normalizeDisplayLabel({ url: 'https://example.test/iu/?u=https%3A%2F%2Fcdn.test%2Fimage.jpg', label: 'Favorite' }), 'Favorite');
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

test('image extension detection supports image service format hints', () => {
  assert.equal(imageExtensionFromUrl('https://example.test/photo.jpeg'), 'JPEG');
  assert.equal(imageExtensionFromUrl('https://pbs.twimg.com/media/example?format=jpg&name=large'), 'JPG');
  assert.equal(imageExtensionFromUrl('https://images.example.test/render?mime=image%2Fwebp'), 'WEBP');
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

  const invalid = validateImageRecordUrl('not a url');
  assert.equal(invalid.ok, false);
  assert.match(invalid.message ?? '', /not a valid URL/i);

  const nonHttp = validateImageRecordUrl('data:image/png;base64,abc');
  assert.equal(nonHttp.ok, false);
  assert.match(nonHttp.message ?? '', /http\(s\)/i);
});
