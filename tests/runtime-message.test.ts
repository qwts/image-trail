import assert from 'node:assert/strict';
import test from 'node:test';

import { createCaptureResultMessage, createSaveBookmarkResultMessage } from '../extension/src/background/messages.js';
import { CaptureController } from '../extension/src/content/capture-controller.js';
import { ExtensionBookmarkStore } from '../extension/src/content/extension-bookmark-store.js';
import {
  connectPCloudProvider,
  disconnectPCloudProvider,
  downloadPCloudBackup,
  listPCloudBackups,
  loadPCloudProviderStatus,
  uploadPCloudBackup,
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

test('sendRuntimeMessage returns null when an async response channel closes before delivery', async () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      id: 'test-extension',
      sendMessage: async () => {
        throw new Error(
          'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
        );
      },
    },
  } as unknown as typeof chrome;

  try {
    const response = await sendRuntimeMessage({ type: 'imageTrail.listPCloudBackups' });
    assert.equal(response, null);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('sendRuntimeMessage returns null when no runtime receiver exists', async () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      id: 'test-extension',
      sendMessage: async () => {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      },
    },
  } as unknown as typeof chrome;

  try {
    const response = await sendRuntimeMessage({ type: 'imageTrail.downloadPCloudBackup' });
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

test('CaptureController sends the retained source context for permission retry', async () => {
  const originalChrome = globalThis.chrome;
  const sent: unknown[] = [];
  globalThis.chrome = {
    runtime: {
      id: 'test-extension',
      sendMessage: async (message: unknown) => {
        sent.push(message);
        return createCaptureResultMessage({
          status: 'failed',
          reason: 'permission-needed',
          message: 'Permission was not granted for https://cdn.example.test.',
          origin: 'https://cdn.example.test',
        });
      },
    },
  } as unknown as typeof chrome;

  try {
    const result = await new CaptureController().requestPermissionAndRetry('https://cdn.example.test/image.jpg', 'bookmark', 'bookmark-1');
    assert.deepEqual(sent, [
      {
        type: 'imageTrail.grantPermissionAndCapture',
        version: 1,
        payload: {
          url: 'https://cdn.example.test/image.jpg',
          sourceType: 'bookmark',
          sourceRecordId: 'bookmark-1',
        },
      },
    ]);
    if (result.status === 'captured') assert.fail('permission denial must remain a failed capture');
    assert.equal(result.reason, 'permission-needed');
    assert.equal(result.origin, 'https://cdn.example.test');
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
    const upload = await uploadPCloudBackup({ fileName: 'backup.json', fileContent: '{}' });
    const list = await listPCloudBackups();
    const download = await downloadPCloudBackup({ fileId: 42, fileName: 'backup.image-trail-encrypted.json' });

    assert.equal(status.connected, false);
    assert.equal(connect.ok, false);
    assert.equal(connect.status.connected, false);
    assert.equal(disconnect.ok, false);
    assert.equal(disconnect.status.connected, false);
    assert.equal(upload.ok, false);
    assert.equal(upload.status.connected, false);
    assert.equal(list.ok, false);
    assert.equal(list.status.connected, false);
    assert.equal(download.ok, false);
    assert.equal(download.status.connected, false);
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
