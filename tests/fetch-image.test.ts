import test from 'node:test';
import assert from 'node:assert/strict';
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
