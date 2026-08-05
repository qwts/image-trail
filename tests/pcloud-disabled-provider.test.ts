import assert from 'node:assert/strict';
import test from 'node:test';

import { BACKUP_HISTORY_STORAGE_KEY } from '../extension/src/background/backup-history-store.js';
import {
  MessageType,
  createConnectPCloudProviderMessage,
  type ConnectPCloudProviderResultMessage,
} from '../extension/src/background/messages.js';

const CONNECTION_KEY = 'imageTrail.pcloudConnection';

function loadDisabledProviderModules() {
  return Promise.all([
    import('../extension/src/background/pcloud-provider.js'),
    import('../extension/src/background/handlers/pcloud-handlers.js'),
  ]);
}

test('disabled builds ignore stale pCloud sessions and keep every provider operation offline', async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const readKeys: string[] = [];
  const removedKeys: string[] = [];
  let permissionRequestCount = 0;
  const storage: Record<string, unknown> = {
    [CONNECTION_KEY]: {
      schemaVersion: 1,
      provider: 'pcloud',
      accessToken: 'stale-token-secret',
      apiHost: 'api.pcloud.com',
      connectedAt: '2026-08-04T00:00:00.000Z',
    },
    [BACKUP_HISTORY_STORAGE_KEY]: { schemaVersion: 1, records: [] },
  };
  let fetchCount = 0;

  globalThis.chrome = {
    permissions: {
      request: async () => {
        permissionRequestCount += 1;
        return true;
      },
    },
    storage: {
      local: {
        setAccessLevel: async () => {},
        get: async (key: string) => {
          readKeys.push(key);
          return { [key]: storage[key] };
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(storage, items);
        },
        remove: async (key: string) => {
          removedKeys.push(key);
          delete storage[key];
        },
      },
    },
  } as unknown as typeof chrome;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error('Disabled pCloud provider attempted a network request.');
  };

  try {
    const [provider, { createPCloudMessageRegistry }] = await loadDisabledProviderModules();
    const connect = (await createPCloudMessageRegistry()[MessageType.ConnectPCloudProvider].handle(
      createConnectPCloudProviderMessage(),
    )) as ConnectPCloudProviderResultMessage['payload'];
    const status = await provider.loadPCloudProviderStatus();
    const upload = await provider.uploadPCloudBackup({ fileName: 'backup.json', fileContent: '{"encrypted":true}' });
    const cleanup = await provider.uploadPCloudBackup({ operation: 'cleanup', fileIds: [301] });
    const list = await provider.listPCloudBackups();
    const download = await provider.downloadPCloudBackup({
      fileId: 301,
      fileName: 'backup.image-trail-encrypted.json',
    });

    assert.equal(status.connected, false);
    assert.equal(connect.ok, false);
    assert.match(connect.message, /not configured in this build/u);
    for (const result of [upload, cleanup, list, download]) {
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, 'not-configured');
        assert.match(result.message, /not configured in this build/u);
      }
    }
    assert.deepEqual(readKeys, [BACKUP_HISTORY_STORAGE_KEY]);
    assert.equal(permissionRequestCount, 0);
    assert.equal(fetchCount, 0);

    const disconnected = await provider.disconnectPCloudProvider();
    assert.equal(disconnected.ok, true);
    assert.deepEqual(removedKeys, [CONNECTION_KEY]);
    assert.equal(storage[CONNECTION_KEY], undefined);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});
