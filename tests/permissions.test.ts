import test from 'node:test';
import assert from 'node:assert/strict';

import { hasOriginPermission, requestOriginPermission } from '../extension/src/background/permissions.js';

test('origin permission checks and requests stay scoped to one origin', async () => {
  const originalChrome = globalThis.chrome;
  const checked: chrome.permissions.Permissions[] = [];
  const requested: chrome.permissions.Permissions[] = [];
  globalThis.chrome = {
    permissions: {
      contains: async (permissions: chrome.permissions.Permissions) => {
        checked.push(permissions);
        return false;
      },
      request: async (permissions: chrome.permissions.Permissions) => {
        requested.push(permissions);
        return false;
      },
    },
  } as unknown as typeof chrome;

  try {
    assert.equal(await hasOriginPermission('https://cdn.example.test'), false);
    assert.equal(await requestOriginPermission('https://cdn.example.test'), false);
    assert.deepEqual(checked, [{ origins: ['https://cdn.example.test/*'] }]);
    assert.deepEqual(requested, [{ origins: ['https://cdn.example.test/*'] }]);
  } finally {
    globalThis.chrome = originalChrome;
  }
});
