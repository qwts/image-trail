import { VISIBLE_BOOKMARK_SOFT_MAX_LIMITS } from '../core/settings.js';
import type { PinSaveStoragePreference } from '../core/types.js';

export interface PlaintextLocalSettings {
  readonly schemaVersion: 1;
  readonly showHistoryThumbnails: boolean;
  readonly requestThrottleMs: number;
  readonly panelDock: 'right' | 'left';
  readonly visibleBookmarkSoftMax: number;
  readonly bookmarkVisibilityScope: 'global' | 'site';
  readonly pinSaveStoragePreference: PinSaveStoragePreference;
  readonly privacyModeEnabled: boolean;
}

export const DEFAULT_LOCAL_SETTINGS: PlaintextLocalSettings = {
  schemaVersion: 1,
  showHistoryThumbnails: false,
  requestThrottleMs: 250,
  panelDock: 'right',
  visibleBookmarkSoftMax: 30,
  bookmarkVisibilityScope: 'global',
  pinSaveStoragePreference: 'encrypted',
  privacyModeEnabled: false,
};

export const LOCAL_SETTINGS_KEY = 'imageTrail.localSettings';
const MIN_REQUEST_THROTTLE_MS = 0;
const MAX_REQUEST_THROTTLE_MS = 60_000;

export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LocalSettingsStore {
  load(): Promise<PlaintextLocalSettings>;
  save(settings: PlaintextLocalSettings): Promise<void>;
}

export class LocalSettingsRepository {
  constructor(private readonly storage: StringStorage = globalThis.localStorage) {}

  load(): PlaintextLocalSettings {
    const raw = this.storage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return DEFAULT_LOCAL_SETTINGS;

    try {
      return migrateLocalSettings(JSON.parse(raw) as Partial<PlaintextLocalSettings>);
    } catch {
      return DEFAULT_LOCAL_SETTINGS;
    }
  }

  save(settings: PlaintextLocalSettings): void {
    this.storage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(migrateLocalSettings(settings)));
  }
}

export function migrateLocalSettings(input: Partial<PlaintextLocalSettings>): PlaintextLocalSettings {
  return {
    schemaVersion: 1,
    showHistoryThumbnails: input.showHistoryThumbnails === true,
    requestThrottleMs: isSafeThrottle(input.requestThrottleMs) ? input.requestThrottleMs : DEFAULT_LOCAL_SETTINGS.requestThrottleMs,
    panelDock: input.panelDock === 'left' ? 'left' : 'right',
    visibleBookmarkSoftMax: isSafeVisibleBookmarkSoftMax(input.visibleBookmarkSoftMax)
      ? input.visibleBookmarkSoftMax
      : DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
    bookmarkVisibilityScope: input.bookmarkVisibilityScope === 'site' ? 'site' : 'global',
    pinSaveStoragePreference: isPinSaveStoragePreference(input.pinSaveStoragePreference)
      ? input.pinSaveStoragePreference
      : DEFAULT_LOCAL_SETTINGS.pinSaveStoragePreference,
    privacyModeEnabled: input.privacyModeEnabled === true,
  };
}

export function isPinSaveStoragePreference(value: unknown): value is PinSaveStoragePreference {
  return value === 'encrypted' || value === 'plaintext';
}

function isSafeThrottle(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_REQUEST_THROTTLE_MS && value <= MAX_REQUEST_THROTTLE_MS;
}

function isSafeVisibleBookmarkSoftMax(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.min &&
    value <= VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.max
  );
}
