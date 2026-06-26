import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureFilenameExtension,
  extensionFromUrl,
  filenameFromImageRecord,
  filenameFromUrl,
  findDownloadDuplicate,
  normalizeAbsoluteUrl,
  sanitizeFilename,
  selectImageDownloadUrls,
} from '../extension/src/core/image/downloads.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

test('sanitizeFilename removes unsafe filesystem characters', () => {
  assert.equal(sanitizeFilename(' ../bad:name?.jpg '), 'bad_name_.jpg');
  assert.equal(sanitizeFilename('***'), 'image');
});

test('download filename helpers keep or infer safe image extensions', () => {
  assert.equal(extensionFromUrl('https://example.test/path/photo.PNG?size=large'), 'png');
  assert.equal(extensionFromUrl('https://example.test/path/no-extension'), 'jpg');
  assert.equal(extensionFromUrl('data:image/jpeg;base64,abc'), 'jpg');
  assert.equal(ensureFilenameExtension('custom name', 'https://example.test/source.webp'), 'custom name.webp');
  assert.equal(filenameFromUrl('https://example.test/images/cat%20photo.jpeg?x=1'), 'cat photo.jpeg');
});

test('download filenames use image names instead of proxy URL fragments', () => {
  const source = 'https://cdn.example.test/images/korn-live-1999.jpg';
  const proxy = `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(source)}&f=1&nofb=1`;
  const pngSource = 'https://cdn.example.test/images/korn-live-1999.png';
  const pngProxy = `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(pngSource)}&f=1&nofb=1`;

  assert.equal(filenameFromUrl(proxy), 'korn-live-1999.jpg');
  assert.equal(filenameFromImageRecord({ url: source, label: 'Korn live at Woodstock' }), 'Korn live at Woodstock.jpg');
  assert.equal(filenameFromImageRecord({ url: pngProxy, label: 'Korn live at Woodstock' }), 'Korn live at Woodstock.png');
  assert.equal(filenameFromImageRecord({ url: 'data:image/png;base64,abc', title: 'local capture' }), 'local capture.png');
});

test('normalizeAbsoluteUrl resolves relative URLs only when a base is supplied', () => {
  assert.equal(normalizeAbsoluteUrl('/image.jpg', 'https://example.test/gallery/page.html'), 'https://example.test/image.jpg');
  assert.equal(normalizeAbsoluteUrl('not a url'), 'not a url');
});

test('findDownloadDuplicate matches verified SHA-256 fingerprints before URL', () => {
  const records = [
    { sourceUrl: 'https://example.test/a.jpg', fingerprint: HASH_A },
    { sourceUrl: 'https://example.test/b.jpg', fingerprint: HASH_B },
  ];

  const duplicate = findDownloadDuplicate(records, { sourceUrl: 'https://example.test/other.jpg', fingerprint: HASH_B });

  assert.equal(duplicate?.matchedBy, 'fingerprint');
  assert.equal(duplicate?.record.sourceUrl, 'https://example.test/b.jpg');
});

test('findDownloadDuplicate falls back to exact URL and ignores bogus fingerprints', () => {
  const records = [{ sourceUrl: 'https://example.test/a.jpg', fingerprint: 'not-a-real-hash' }];

  assert.equal(findDownloadDuplicate(records, { sourceUrl: 'https://example.test/other.jpg', fingerprint: 'not-a-real-hash' }), null);
  const duplicate = findDownloadDuplicate(records, { sourceUrl: 'https://example.test/a.jpg', fingerprint: 'not-a-real-hash' });
  assert.equal(duplicate?.matchedBy, 'url');
});

test('selectImageDownloadUrls prioritizes selected history and bookmarks before fallbacks', () => {
  const history = [
    { id: 'h1', url: 'https://example.test/history-1.jpg' },
    { id: 'h2', url: 'https://example.test/history-2.jpg' },
  ];
  const bookmarks = [
    { id: 'b1', url: 'https://example.test/bookmark-1.jpg' },
    { id: 'b2', url: 'https://example.test/bookmark-2.jpg' },
  ];

  assert.deepEqual(
    selectImageDownloadUrls({
      history,
      bookmarks,
      selectedHistoryIds: ['h2'],
      selectedBookmarkIds: ['b1'],
      currentImageUrl: 'https://example.test/current.jpg',
    }),
    ['https://example.test/history-2.jpg'],
  );
  assert.deepEqual(
    selectImageDownloadUrls({
      history,
      bookmarks,
      selectedHistoryIds: [],
      selectedBookmarkIds: ['b2', 'b1'],
      currentImageUrl: 'https://example.test/current.jpg',
    }),
    ['https://example.test/bookmark-1.jpg', 'https://example.test/bookmark-2.jpg'],
  );
  assert.deepEqual(
    selectImageDownloadUrls({ history, bookmarks, selectedHistoryIds: [], selectedBookmarkIds: [], currentImageUrl: null }),
    ['https://example.test/history-1.jpg'],
  );
});
