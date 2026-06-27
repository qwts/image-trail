import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePCloudApiHost, parsePCloudOAuthRedirect } from '../extension/src/core/cloud/pcloud-provider.js';

test('normalizes only pCloud API hosts', () => {
  assert.equal(normalizePCloudApiHost('api.pcloud.com'), 'api.pcloud.com');
  assert.equal(normalizePCloudApiHost('https://eapi.pcloud.com/some/path'), 'eapi.pcloud.com');
  assert.equal(normalizePCloudApiHost('', 'eapi.pcloud.com'), 'eapi.pcloud.com');
  assert.throws(() => normalizePCloudApiHost('example.com'), /api\.pcloud\.com or eapi\.pcloud\.com/u);
});

test('parses token-flow pCloud OAuth redirects from fragments', () => {
  const redirect = new URL('https://example.chromiumapp.org/pcloud');
  redirect.hash = new URLSearchParams({
    access_token: 'token-123',
    hostname: 'eapi.pcloud.com',
    state: 'state-123',
  }).toString();

  assert.deepEqual(parsePCloudOAuthRedirect(redirect.toString(), 'state-123'), {
    accessToken: 'token-123',
    apiHost: 'eapi.pcloud.com',
    state: 'state-123',
  });
});

test('rejects OAuth redirects with unexpected state or unsafe hosts', () => {
  const wrongState = 'https://example.chromiumapp.org/pcloud#access_token=token-123&state=state-456';
  assert.throws(() => parsePCloudOAuthRedirect(wrongState, 'state-123'), /unexpected state/u);

  const unsafeHost = 'https://example.chromiumapp.org/pcloud#access_token=token-123&hostname=example.com&state=state-123';
  assert.throws(() => parsePCloudOAuthRedirect(unsafeHost, 'state-123'), /api\.pcloud\.com or eapi\.pcloud\.com/u);
});
