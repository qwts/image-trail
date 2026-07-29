import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchImageBytes } from '../extension/src/background/fetch-image.js';

test('fetchImageBytes does not pass page URLs as service worker referrers', async () => {
  const calls: RequestInit[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init ?? {});
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
  };

  try {
    const result = await fetchImageBytes('https://cdn.example.test/image.png', 1024, { referrer: 'https://page.example.test/gallery' });
    assert.equal(result.ok, true);
    assert.equal(calls[0]?.credentials, 'omit');
    assert.equal('referrer' in calls[0]!, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchImageBytes includes credentials only for same-origin page images', async () => {
  const calls: RequestInit[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init ?? {});
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };

  try {
    await fetchImageBytes('https://secure.example.test/image.jpg', 1024, { referrer: 'https://secure.example.test/page' });
    await fetchImageBytes('https://secure.example.test/image.jpg', 1024, { referrer: 'not a url' });
    assert.equal(calls[0]?.credentials, 'include');
    assert.equal(calls[1]?.credentials, 'omit');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchImageBytes classifies GIF bytes by signature and corrects a mismatched response filename', async () => {
  const originalFetch = globalThis.fetch;
  const bytes = readFileSync('tests/e2e/pages/assets/animated/animated.gif');
  globalThis.fetch = async () =>
    new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'content-disposition': "inline; filename*=UTF-8''party%20loop.jpg",
      },
    });

  try {
    const result = await fetchImageBytes('https://cdn.example.test/wrong-extension.jpg');
    assert.deepEqual(result.ok ? { ...result, bytes: undefined } : result, {
      ok: true,
      bytes: undefined,
      mimeType: 'image/gif',
      byteLength: 3723,
      fileName: 'party loop.gif',
      width: 40,
      height: 40,
      mediaInfo: { kind: 'gif', animated: true, frameCount: 3, loopCount: 0 },
    });
    assert.deepEqual(result.ok ? new Uint8Array(result.bytes) : null, new Uint8Array(bytes));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchImageBytes corrects a mismatched URL extension from the verified media signature', async () => {
  const originalFetch = globalThis.fetch;
  const bytes = readFileSync('tests/e2e/pages/assets/animated/animated.gif');
  globalThis.fetch = async () =>
    new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'image/gif' },
    });

  try {
    const result = await fetchImageBytes('https://cdn.example.test/wrong-extension.jpg');
    assert.equal(result.ok ? result.fileName : null, 'wrong-extension.gif');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchImageBytes rejects malformed declared GIF/WebP before returning capture bytes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
      status: 200,
      headers: { 'content-type': 'image/webp' },
    });

  try {
    assert.deepEqual(await fetchImageBytes('https://cdn.example.test/broken.webp'), {
      ok: false,
      reason: 'not-image',
      message: 'WebP data does not match its declared image format.',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
