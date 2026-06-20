import assert from 'node:assert/strict';
import test from 'node:test';

import { sendRuntimeMessage } from '../extension/src/content/runtime-message.js';

test('sendRuntimeMessage returns null when the extension context is invalidated', async () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      id: 'test-extension',
      sendMessage: async () => {
        throw new Error('Extension context invalidated.');
      },
    },
  } as unknown as typeof chrome;

  try {
    const response = await sendRuntimeMessage({ type: 'imageTrail.cleanupOrphanedBlobs' });
    assert.equal(response, null);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('sendRuntimeMessage rethrows unexpected runtime errors', async () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      id: 'test-extension',
      sendMessage: async () => {
        throw new Error('Background exploded.');
      },
    },
  } as unknown as typeof chrome;

  try {
    await assert.rejects(() => sendRuntimeMessage({ type: 'imageTrail.cleanupOrphanedBlobs' }), /Background exploded/);
  } finally {
    globalThis.chrome = originalChrome;
  }
});
