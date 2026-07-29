import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchLinkedPage } from '../extension/src/background/fetch-linked-page.js';
import { createFetchLinkedPageMessage } from '../extension/src/background/messages.js';

test('linked-page fetch checks target-origin permission before network I/O', async () => {
  const checkedOrigins: string[] = [];
  let fetched = false;
  const result = await fetchLinkedPage(
    createFetchLinkedPageMessage('https://target.example.test/page', 'https://source.example.test/gallery', 1024, 2000),
    {
      hasPermission: async (origin) => {
        checkedOrigins.push(origin);
        return false;
      },
      fetchImpl: async () => {
        fetched = true;
        throw new Error('fetch must not run without permission');
      },
    },
  );

  assert.deepEqual(checkedOrigins, ['https://target.example.test']);
  assert.equal(fetched, false);
  assert.deepEqual(result, {
    ok: false,
    reason: 'permission-needed',
    message: 'Permission needed for https://target.example.test.',
    origin: 'https://target.example.test',
  });
});

test('linked-page fetch omits credentials across origins without forwarding the page referrer', async () => {
  const calls: Array<{ readonly input: RequestInfo | URL; readonly init?: RequestInit | undefined }> = [];
  const result = await fetchLinkedPage(
    createFetchLinkedPageMessage('https://target.example.test/page', 'https://source.example.test/gallery', 1024, 2000),
    {
      hasPermission: async () => true,
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return new Response('<meta property="og:image" content="/image.jpg">', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(calls[0]?.input, 'https://target.example.test/page');
  assert.equal(calls[0]?.init?.credentials, 'omit');
  assert.equal('referrer' in calls[0]!.init!, false);
});

test('linked-page fetch includes credentials only for same-origin source pages', async () => {
  const credentials: RequestCredentials[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    credentials.push(init?.credentials ?? 'same-origin');
    return new Response('<html></html>', { status: 200 });
  };

  const sameOrigin = await fetchLinkedPage(
    createFetchLinkedPageMessage('https://secure.example.test/page', 'https://secure.example.test/gallery', 1024, 2000),
    { hasPermission: async () => true, fetchImpl },
  );
  const malformedReferrer = await fetchLinkedPage(
    createFetchLinkedPageMessage('https://secure.example.test/page', 'not a url', 1024, 2000),
    { hasPermission: async () => true, fetchImpl },
  );

  assert.equal(sameOrigin.ok, true);
  assert.equal(malformedReferrer.ok, true);
  assert.deepEqual(credentials, ['include', 'omit']);
});

test('linked-page fetch rejects non-HTTP targets before permission or network access', async () => {
  let permissionChecked = false;
  let fetched = false;
  const result = await fetchLinkedPage(createFetchLinkedPageMessage('file:///private/data', 'https://example.test/', 1024, 2000), {
    hasPermission: async () => {
      permissionChecked = true;
      return true;
    },
    fetchImpl: async () => {
      fetched = true;
      throw new Error('unsupported targets must not be fetched');
    },
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'unsupported-url',
    message: 'Linked page URL must use HTTP or HTTPS.',
  });
  assert.equal(permissionChecked, false);
  assert.equal(fetched, false);
});
