import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleSaveLocalSettings,
  loadLocalSettings,
  type LocalSettingsStorageArea,
  type SettingsTabMessenger,
} from '../extension/src/background/handlers/local-settings-handlers.js';
import { createSaveLocalSettingsMessage } from '../extension/src/background/messages.js';
import { DEFAULT_LOCAL_SETTINGS, LOCAL_SETTINGS_KEY } from '../extension/src/data/local-settings.js';

function storageHarness(initial: unknown): { readonly storage: LocalSettingsStorageArea; read(): unknown } {
  let value = initial;
  return {
    storage: {
      get: async () => ({ [LOCAL_SETTINGS_KEY]: value }),
      set: async (items) => {
        value = items[LOCAL_SETTINGS_KEY];
      },
    },
    read: () => value,
  };
}

function tab(id?: number): chrome.tabs.Tab {
  return { ...(id === undefined ? {} : { id }) } as chrome.tabs.Tab;
}

test('local settings handlers migrate persisted values and notify every injected-tab candidate', async () => {
  const harness = storageHarness(JSON.stringify({ ...DEFAULT_LOCAL_SETTINGS, downArrowAction: 'download' }));
  assert.equal((await loadLocalSettings(harness.storage)).downArrowAction, 'download');

  const sent: { readonly tabId: number; readonly message: unknown }[] = [];
  const tabs: SettingsTabMessenger = {
    query: async () => [tab(3), tab(5), tab()],
    sendMessage: async (tabId, message) => {
      sent.push({ tabId, message });
    },
  };
  const result = await handleSaveLocalSettings(
    createSaveLocalSettingsMessage({ ...DEFAULT_LOCAL_SETTINGS, downArrowAction: 'off' }),
    harness.storage,
    tabs,
  );

  assert.deepEqual(result, { ok: true });
  assert.equal((harness.read() as typeof DEFAULT_LOCAL_SETTINGS).downArrowAction, 'off');
  assert.deepEqual(
    sent.map((entry) => entry.tabId),
    [3, 5],
  );
  assert.ok(sent.every((entry) => (entry.message as { type?: unknown }).type === 'imageTrail.settingsChanged'));
});

test('settings persistence does not fail when tab notification is unavailable', async () => {
  const harness = storageHarness(null);
  const tabs: SettingsTabMessenger = {
    query: async () => {
      throw new Error('tabs unavailable');
    },
    sendMessage: async () => undefined,
  };

  const result = await handleSaveLocalSettings(createSaveLocalSettingsMessage(DEFAULT_LOCAL_SETTINGS), harness.storage, tabs);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(harness.read(), DEFAULT_LOCAL_SETTINGS);
});

test('legacy plaintext thumbnail policy passes save validation input and persists as encrypted', async () => {
  const harness = storageHarness(null);
  const tabs: SettingsTabMessenger = { query: async () => [], sendMessage: async () => undefined };
  const legacySettings = {
    ...DEFAULT_LOCAL_SETTINGS,
    searchableMetadataPolicy: { ...DEFAULT_LOCAL_SETTINGS.searchableMetadataPolicy, thumbnail: 'plaintext' as const },
  };

  const result = await handleSaveLocalSettings(createSaveLocalSettingsMessage(legacySettings), harness.storage, tabs);

  assert.deepEqual(result, { ok: true });
  assert.equal((harness.read() as typeof DEFAULT_LOCAL_SETTINGS).searchableMetadataPolicy.thumbnail, 'encrypted');
});
