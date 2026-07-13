import test from 'node:test';
import assert from 'node:assert/strict';

import { createPCloudMessageRegistry } from '../extension/src/background/handlers/pcloud-handlers.js';
import { PCLOUD_HOST_PERMISSION } from '../extension/src/background/permissions.js';
import { MessageType, createConnectPCloudProviderMessage } from '../extension/src/background/messages.js';

test('pCloud connection requests only pCloud hosts and fails cleanly when denied', async () => {
  const originalChrome = globalThis.chrome;
  const requested: chrome.permissions.Permissions[] = [];
  globalThis.chrome = {
    permissions: {
      request: async (permissions: chrome.permissions.Permissions) => {
        requested.push(permissions);
        return false;
      },
    },
  } as unknown as typeof chrome;

  try {
    const entry = createPCloudMessageRegistry()[MessageType.ConnectPCloudProvider];
    const result = await entry.handle(createConnectPCloudProviderMessage());

    assert.deepEqual(requested, [{ origins: [PCLOUD_HOST_PERMISSION] }]);
    assert.deepEqual(result, {
      ok: false,
      status: {
        connected: false,
        message: 'pCloud access was not granted. Connect again to approve access only to pCloud hosts.',
        messageIsError: true,
      },
      message: 'pCloud access was not granted. Connect again to approve access only to pCloud hosts.',
    });
  } finally {
    globalThis.chrome = originalChrome;
  }
});
