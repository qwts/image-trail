import {
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_SETTINGS_KEY,
  migrateLocalSettings,
  type PlaintextLocalSettings,
} from '../../data/local-settings.js';
import type { SaveLocalSettingsMessage } from '../messages.js';
import { createSettingsChangeMessage } from '../settings-change-message.js';

export interface LocalSettingsStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface SettingsTabMessenger {
  query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
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
  onSaved?: (settings: PlaintextLocalSettings) => void,
): Promise<import('../messages.js').SaveLocalSettingsResultMessage['payload']> {
  const settings = migrateLocalSettings(message.payload.settings);
  await storage.set({ [LOCAL_SETTINGS_KEY]: settings });
  onSaved?.(settings);
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
