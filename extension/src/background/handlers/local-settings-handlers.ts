import {
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_SETTINGS_KEY,
  migrateLocalSettings,
  type PlaintextLocalSettings,
} from '../../data/local-settings.js';
import type { SearchableMetadataPolicy } from '../../core/metadata-policy.js';
import { updateBlobKeyInactivityTimeout } from '../../data/crypto/blob-keyring.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createLoadLocalSettingsResultMessage,
  createSaveLocalSettingsResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type LoadLocalSettingsMessage,
  type SaveLocalSettingsMessage,
} from '../messages.js';
import type { RecentHistoryCache } from '../recent-history-cache.js';
import { createSettingsChangeMessage } from '../settings-change-message.js';

export interface LocalSettingsStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface SettingsTabMessenger {
  query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

type LocalSettingsRequestType = typeof MessageType.LoadLocalSettings | typeof MessageType.SaveLocalSettings;

export function createLocalSettingsMessageRegistry(deps: {
  readonly recentHistoryCache: RecentHistoryCache;
  readonly reconcileSearchableMetadataPolicy: (policy: SearchableMetadataPolicy) => Promise<void>;
}): Record<LocalSettingsRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  return {
    [MessageType.LoadLocalSettings]: defineMessage({
      requestSchema: requestSchemas.loadLocalSettingsRequestSchema,
      handle: (_message: LoadLocalSettingsMessage) => handleLoadLocalSettings(),
      respond: (result) => createLoadLocalSettingsResultMessage(result),
      fallback: () => createLoadLocalSettingsResultMessage({ ok: false, message: 'Local settings could not be loaded.' }),
    }),
    [MessageType.SaveLocalSettings]: defineMessage({
      requestSchema: requestSchemas.saveLocalSettingsRequestSchema,
      handle: async (message: SaveLocalSettingsMessage) => {
        await deps.recentHistoryCache.ready();
        const result = await handleSaveLocalSettings(message, chrome.storage.local, chrome.tabs, (settings) => {
          deps.recentHistoryCache.pruneForSettings(settings);
        });
        await deps.recentHistoryCache.flush();
        if (result.ok) {
          const saved = await loadLocalSettings();
          await deps.reconcileSearchableMetadataPolicy(saved.searchableMetadataPolicy);
          await updateBlobKeyInactivityTimeout(saved.blobKeyInactivityTimeoutMinutes);
        }
        return result;
      },
      respond: (result) => createSaveLocalSettingsResultMessage(result),
      fallback: () => createSaveLocalSettingsResultMessage({ ok: false }),
    }),
  };
}

export async function loadLocalSettings(storage: LocalSettingsStorageArea = chrome.storage.local): Promise<PlaintextLocalSettings> {
  const stored = await storage.get(LOCAL_SETTINGS_KEY);
  const raw = stored[LOCAL_SETTINGS_KEY];
  if (typeof raw === 'string') {
    try {
      return migrateLocalSettings(JSON.parse(raw) as Partial<PlaintextLocalSettings>);
    } catch {
      return DEFAULT_LOCAL_SETTINGS;
    }
  }
  return migrateLocalSettings(typeof raw === 'object' && raw !== null ? raw : DEFAULT_LOCAL_SETTINGS);
}

export async function handleLoadLocalSettings(
  storage: LocalSettingsStorageArea = chrome.storage.local,
): Promise<import('../messages.js').LoadLocalSettingsResultMessage['payload']> {
  return { ok: true, settings: await loadLocalSettings(storage) };
}

export async function handleSaveLocalSettings(
  message: SaveLocalSettingsMessage,
  storage: LocalSettingsStorageArea = chrome.storage.local,
  tabs: SettingsTabMessenger = chrome.tabs,
  onSaved?: (settings: PlaintextLocalSettings) => void | Promise<void>,
): Promise<import('../messages.js').SaveLocalSettingsResultMessage['payload']> {
  const settings = migrateLocalSettings(message.payload.settings);
  await storage.set({ [LOCAL_SETTINGS_KEY]: settings });
  await onSaved?.(settings);
  await notifyInjectedPanels(tabs);
  return { ok: true };
}

async function notifyInjectedPanels(tabs: SettingsTabMessenger): Promise<void> {
  try {
    const openTabs = await tabs.query({});
    const message = createSettingsChangeMessage();
    await Promise.allSettled(
      openTabs.map((tab) => (typeof tab.id === 'number' ? tabs.sendMessage(tab.id, message) : Promise.resolve(undefined))),
    );
  } catch {
    // Settings persistence succeeds even when no injected source panel is available.
  }
}
