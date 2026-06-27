import assert from 'node:assert/strict';
import test from 'node:test';

import { createSaveBookmarkResultMessage } from '../extension/src/background/messages.js';
import { ExtensionBookmarkStore } from '../extension/src/content/extension-bookmark-store.js';
import {
  connectPCloudProvider,
  disconnectPCloudProvider,
  loadPCloudProviderStatus,
} from '../extension/src/content/pcloud-provider-client.js';
import { sendRuntimeMessage } from '../extension/src/content/runtime-message.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';

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

test('pCloud provider client treats runtime failures as unavailable status', async () => {
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
    const status = await loadPCloudProviderStatus();
    const connect = await connectPCloudProvider();
    const disconnect = await disconnectPCloudProvider();

    assert.equal(status.connected, false);
    assert.equal(connect.ok, false);
    assert.equal(connect.status.connected, false);
    assert.equal(disconnect.ok, false);
    assert.equal(disconnect.status.connected, false);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('ExtensionBookmarkStore exposes failed bookmark saves without treating the draft as durable', async () => {
  const originalChrome = globalThis.chrome;
  const draft = createDisplayRecord({
    id: 'https://example.test/recent.jpg',
    url: 'https://example.test/recent.jpg',
    timestamp: '2026-06-22T00:00:00.000Z',
    source: 'bookmark',
  });
  globalThis.chrome = {
    runtime: {
      id: 'test-extension',
      sendMessage: async () => createSaveBookmarkResultMessage({ ok: false, message: 'Bookmark save failed.' }),
    },
  } as unknown as typeof chrome;

  try {
    const store = new ExtensionBookmarkStore();
    const result = await store.saveResult(draft);
    const legacySave = await store.save(draft);

    assert.deepEqual(result, { ok: false, message: 'Bookmark save failed.' });
    assert.equal(legacySave, draft);
  } finally {
    globalThis.chrome = originalChrome;
  }
});
