import { isLibraryChangeMessage } from '../background/library-change-messages.js';
import { createLoadBuildIdentityMessage, isLoadBuildIdentityResultMessage } from '../background/messages.js';
import { ExtensionBookmarkStore } from '../content/extension-bookmark-store.js';
import { ExtensionLocalSettingsStore } from '../content/local-settings-store.js';
import { RecallStore, type RecallCandidatesResult, type RecallRecordsResult } from '../content/recall-store.js';
import { sendRuntimeMessage } from '../content/runtime-message.js';
import type { BuildIdentity } from '../core/build-info.js';
import { recordHasStoredOriginal } from '../core/display-records.js';
import type { UrlReviewStatusRecord } from '../core/types.js';
import type { PlaintextLocalSettings } from '../data/local-settings.js';
import { LOCAL_SETTINGS_KEY } from '../data/local-settings.js';
import { IndexedDbUrlReviewStatusStore } from '../data/url-review-status-controller.js';

const DASHBOARD_LIMIT = 200;
const RECALL_LIMIT = 100;
const REFRESH_DEBOUNCE_MS = 150;

export interface DashboardSnapshot {
  readonly limit: number;
  readonly total: number;
  readonly captured: number;
  readonly pins: number;
  readonly truncated: boolean;
}

export interface RecallWindow {
  readonly result: RecallCandidatesResult;
  readonly privacyMode: boolean;
  readonly windowStart: number;
}

export interface DestinationServices {
  loadDashboard(): Promise<DashboardSnapshot>;
  loadRecall(offset?: number): Promise<RecallWindow>;
  recall(ids: readonly string[]): Promise<RecallRecordsResult>;
  loadSettings(): Promise<PlaintextLocalSettings>;
  loadUrlReviewStatus(): Promise<readonly UrlReviewStatusRecord[]>;
  saveSettings(settings: PlaintextLocalSettings): Promise<void>;
  loadBuildIdentity(): Promise<BuildIdentity | null>;
  subscribeLibrary(refresh: () => void): () => void;
  subscribeSettings(refresh: () => void): () => void;
}

export function createDestinationServices(): DestinationServices {
  const bookmarks = new ExtensionBookmarkStore();
  const recall = new RecallStore();
  const settings = new ExtensionLocalSettingsStore();
  return {
    async loadDashboard() {
      const page = await bookmarks.loadPage({ offset: 0, limit: DASHBOARD_LIMIT, scope: 'global' });
      const captured = page.items.filter(recordHasStoredOriginal).length;
      return {
        limit: DASHBOARD_LIMIT,
        total: page.total,
        captured,
        pins: page.items.length - captured,
        truncated: page.total > page.items.length,
      };
    },
    async loadRecall(offset) {
      const localSettings = await settings.load();
      const windowStart = offset ?? localSettings.visibleBookmarkSoftMax;
      const result = await recall.loadCandidates({ offset: windowStart, limit: RECALL_LIMIT, scope: 'global' });
      return { result, privacyMode: localSettings.privacyModeEnabled, windowStart };
    },
    recall: (ids) => recall.recall(ids),
    loadSettings: () => settings.load(),
    loadUrlReviewStatus: async () => {
      const current = await settings.load();
      const reviews = new IndexedDbUrlReviewStatusStore({
        getSearchableMetadataPolicy: () => current.searchableMetadataPolicy,
      });
      try {
        return await reviews.listAll();
      } finally {
        await reviews.close();
      }
    },
    saveSettings: (value) => settings.save(value),
    loadBuildIdentity,
    subscribeLibrary: (refresh) => subscribeLibrary(refresh),
    subscribeSettings: (refresh) => subscribeSettings(refresh),
  };
}

async function loadBuildIdentity(): Promise<BuildIdentity | null> {
  const response = await sendRuntimeMessage(createLoadBuildIdentityMessage());
  return isLoadBuildIdentityResultMessage(response) && response.payload.ok ? response.payload.identity : null;
}

function subscribeLibrary(refresh: () => void): () => void {
  let timer: number | null = null;
  const listener = (message: unknown) => {
    if (!isLibraryChangeMessage(message)) return false;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    return false;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    chrome.runtime.onMessage.removeListener(listener);
  };
}

function subscribeSettings(refresh: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'local' && LOCAL_SETTINGS_KEY in changes) refresh();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
