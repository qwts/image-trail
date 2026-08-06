import assert from 'node:assert/strict';
import test from 'node:test';

import { MESSAGE_PROTOCOL_VERSION, MessageType, type UploadPCloudBackupResultMessage } from '../extension/src/background/messages.js';

const buildScope = globalThis as typeof globalThis & { __IMAGE_TRAIL_PCLOUD_CLIENT_ID__?: string };
buildScope.__IMAGE_TRAIL_PCLOUD_CLIENT_ID__ = 'image-trail-unit-client';
const [{ createPCloudMessageRegistry }, { uploadPCloudBackup }] = await Promise.all([
  import('../extension/src/background/handlers/pcloud-handlers.js'),
  import('../extension/src/background/pcloud-provider.js'),
]);

const CONNECTION_KEY = 'imageTrail.pcloudConnection';

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function installConnection(): () => void {
  const originalChrome = globalThis.chrome;
  const storage = {
    [CONNECTION_KEY]: {
      schemaVersion: 1,
      provider: 'pcloud',
      accessToken: 'token-secret',
      apiHost: 'api.pcloud.com',
      connectedAt: '2026-07-28T00:00:00.000Z',
    },
  };
  globalThis.chrome = {
    storage: {
      local: {
        setAccessLevel: async () => {},
        get: async () => storage,
        set: async () => {},
      },
    },
  } as unknown as typeof chrome;
  return () => {
    globalThis.chrome = originalChrome;
  };
}

function folderId(init: RequestInit | undefined): number {
  const params = init?.body as URLSearchParams;
  if (params.get('folderid') === '0' && params.get('name') === 'Applications') return 100;
  if (params.get('folderid') === '100' && params.get('name') === 'Playbook-Eng-Trail-Overlook-1') return 200;
  if (params.get('folderid') === '200' && params.get('name') === 'backups') return 300;
  throw new Error(`Unexpected pCloud folder path segment ${params.get('name') ?? ''}.`);
}

test('partial cleanup deletes only allowlisted Image Trail part files from the backup folder', async () => {
  const restoreChrome = installConnection();
  const originalFetch = globalThis.fetch;
  const deletedIds: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/createfolderifnotexists')) {
      return jsonResponse({ result: 0, metadata: { isfolder: true, folderid: folderId(init) } });
    }
    if (url.endsWith('/listfolder')) {
      return jsonResponse({
        result: 0,
        metadata: {
          contents: [
            { fileid: 301, name: 'image-trail-cloud-safe-metadata.image-trail-part.json' },
            { fileid: 302, name: 'image-trail-pcloud-backup.image-trail-encrypted.json' },
            { fileid: 303, name: 'unrelated.txt' },
          ],
        },
      });
    }
    if (url.endsWith('/deletefile')) {
      const params = init?.body as URLSearchParams;
      deletedIds.push(params.get('fileid') ?? '');
      return jsonResponse({ result: 0 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const result = await uploadPCloudBackup({ operation: 'cleanup', fileIds: [301, 302, 303, 999] });

    assert.equal(result.ok, false);
    assert.deepEqual(result.deletedFileIds, [301]);
    if (!result.ok) assert.deepEqual(result.failedFileIds, [302, 303, 999]);
    assert.deepEqual(deletedIds, ['301']);
    assert.match(result.message, /Cleanup still needed/u);
    assert.doesNotMatch(JSON.stringify(result), /token-secret/u);
  } finally {
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test('partial cleanup reports a successful idempotent boundary when no file ids are pending', async () => {
  const restoreChrome = installConnection();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('No provider call expected.');
  };
  try {
    const result = await uploadPCloudBackup({ operation: 'cleanup', fileIds: [] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.deletedFileIds, []);
  } finally {
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test('cleanup message fallback preserves the requested ids for a safe retry', () => {
  const cleanup = createPCloudMessageRegistry()[MessageType.UploadPCloudBackup].fallback({
    type: MessageType.UploadPCloudBackup,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { operation: 'cleanup', fileIds: [41, 42] },
  }) as UploadPCloudBackupResultMessage;

  assert.deepEqual(cleanup.payload, {
    ok: false,
    status: { connected: false, message: 'pCloud backup cleanup failed.', messageIsError: true },
    reason: 'upload-failed',
    message: 'pCloud backup cleanup failed.',
    deletedFileIds: [],
    failedFileIds: [41, 42],
  });
});
