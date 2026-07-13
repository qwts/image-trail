import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PCLOUD_HOST_PERMISSION,
  hasHostPermission,
  hasOriginPermission,
  requestHostPermission,
  requestOriginPermission,
} from '../extension/src/background/permissions.js';

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
    assert.equal(await hasHostPermission(PCLOUD_HOST_PERMISSION), false);
    assert.equal(await requestHostPermission(PCLOUD_HOST_PERMISSION), false);
    assert.deepEqual(checked, [{ origins: ['https://cdn.example.test/*'] }, { origins: [PCLOUD_HOST_PERMISSION] }]);
    assert.deepEqual(requested, [{ origins: ['https://cdn.example.test/*'] }, { origins: [PCLOUD_HOST_PERMISSION] }]);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('host permission helpers fail closed without the extension permissions API', async () => {
  const originalChrome = globalThis.chrome;
  Reflect.deleteProperty(globalThis, 'chrome');
  try {
    assert.equal(await hasHostPermission('https://example.test/*'), false);
    assert.equal(await requestHostPermission('https://example.test/*'), false);
  } finally {
    globalThis.chrome = originalChrome;
  }
});
