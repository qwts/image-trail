import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchImageForCapture } from '../extension/src/background/fetch-image.js';
import { originPermissionPattern } from '../extension/src/background/permissions.js';
import { sha256Hex } from '../extension/src/core/image/fingerprints.js';

test('computes stable SHA-256 fingerprints for exact image bytes', async () => {
  const bytes = new TextEncoder().encode('image-bytes').buffer;
  assert.equal(await sha256Hex(bytes), '2c8648d103e3dd7ad87660da0f126a1443b6d21ac1bd3ec000c5e24e2373a90c');
});

test('fetch capture validates image type, byte bounds, and hashes bytes', async () => {
  const body = new Uint8Array([1, 2, 3, 4]).buffer;
  const result = await fetchImageForCapture('https://cdn.example.test/image.png', {
    now: '2026-06-18T00:00:00.000Z',
    fetcher: async () => new Response(body, { status: 200, headers: { 'content-type': 'image/png', 'content-length': '4' } }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.record.mimeType, 'image/png');
  assert.equal(result.ok && result.record.byteLength, 4);
  assert.equal(result.ok && result.record.sha256, await sha256Hex(body));
});

test('fetch capture returns remote-only for oversized originals before storing bytes', async () => {
  const result = await fetchImageForCapture('https://cdn.example.test/huge.jpg', {
    maxBytes: 3,
    fetcher: async () => new Response(new Uint8Array([1, 2, 3, 4]).buffer, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.status, 'remote-only');
  assert.equal(result.ok ? undefined : result.reason, 'too-large');
});

test('origin permission patterns stay specific to the image origin', () => {
  assert.equal(originPermissionPattern('https://cdn.example.test/path/image.jpg'), 'https://cdn.example.test/*');
});
