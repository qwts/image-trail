import assert from 'node:assert/strict';
import test from 'node:test';

import { PCloudApiError, PCloudHttpTransport, pCloudDownloadUrl } from '../extension/src/background/pcloud-http-transport.js';

const credential = { accessToken: 'interop-secret', apiHost: 'api.pcloud.com' } as const;

test('shared pCloud transport preserves the browser fetch receiver and request shape', async () => {
  const transport = new PCloudHttpTransport({
    referrer: 'https://my.pcloud.com/',
    fetchImpl: function (this: unknown, input, init) {
      assert.equal(this, globalThis);
      assert.equal(String(input), 'https://api.pcloud.com/userinfo');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.referrer, 'https://my.pcloud.com/');
      assert.equal(new Headers(init?.headers).get('content-type'), 'application/x-www-form-urlencoded;charset=UTF-8');
      assert.equal((init?.body as URLSearchParams).get('access_token'), 'interop-secret');
      return Promise.resolve(Response.json({ result: 0, quota: 100 }));
    } as typeof fetch,
  });

  assert.deepEqual(await transport.request(credential, 'userinfo'), { result: 0, quota: 100 });
});

test('shared pCloud transport leaves multipart boundaries to fetch and exposes typed provider failures', async () => {
  const transport = new PCloudHttpTransport({
    referrer: 'https://my.pcloud.com/',
    fetchImpl: async (_input, init) => {
      assert.equal(init?.headers, undefined);
      const form = init?.body as FormData;
      assert.equal(form.get('access_token'), 'interop-secret');
      return Response.json({ result: 2003, error: 'Access denied.' });
    },
  });

  await assert.rejects(
    transport.requestForm(credential, 'uploadfile', new FormData()),
    (error: unknown) =>
      error instanceof PCloudApiError && error.method === 'uploadfile' && error.resultCode === 2003 && error.message === 'Access denied.',
  );
});

test('shared pCloud transport accepts only HTTPS pCloud download locations', () => {
  assert.equal(pCloudDownloadUrl('c123.pcloud.com', '/download/object.bin').toString(), 'https://c123.pcloud.com/download/object.bin');
  assert.throws(() => pCloudDownloadUrl('attacker.example', '/object.bin'), /unexpected download location/u);
  assert.throws(() => pCloudDownloadUrl('pcloud.com', '@attacker.example/object.bin'), /unexpected download location/u);
});
