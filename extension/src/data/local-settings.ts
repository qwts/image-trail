import {
  DEFAULT_NEIGHBOR_PRELOAD_CACHE_LIMIT,
  DEFAULT_NEIGHBOR_PRELOAD_RADIUS,
  DEFAULT_URL_REVIEW_STATUS_LIMIT,
  NEIGHBOR_PRELOAD_CACHE_LIMITS,
  NEIGHBOR_PRELOAD_RADIUS_LIMITS,
  RECENT_HISTORY_LIMITS,
  REQUEST_THROTTLE_MAX_REQUESTS_LIMITS,
  REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS,
  REQUEST_THROTTLE_WINDOW_LIMITS,
  URL_REVIEW_STATUS_LIMITS,
  VISIBLE_BOOKMARK_SOFT_MAX_LIMITS,
} from '../core/settings.js';
import { DEFAULT_GOVERNOR_CONFIG } from '../core/automation/types.js';
import { DEFAULT_PREVIEW_OBJECT_FIT, isObjectFitMode, type ObjectFitMode } from '../core/preview-style.js';
import type { PinSaveStoragePreference, RecentHistoryOverflowBehavior } from '../core/types.js';

export interface PlaintextLocalSettings {
  readonly schemaVersion: 1;
  readonly showHistoryThumbnails: boolean;
  readonly requestThrottleMs: number;
  readonly requestThrottleMaxRequests: number;
  readonly requestThrottleWindowMs: number;
  readonly panelDock: 'right' | 'left';
  readonly visibleBookmarkSoftMax: number;
  readonly recentHistoryLimit: number;
  readonly recentHistoryOverflowBehavior: RecentHistoryOverflowBehavior;
  readonly bookmarkVisibilityScope: 'global' | 'site';
  readonly pinSaveStoragePreference: PinSaveStoragePreference;
  readonly privacyModeEnabled: boolean;
  readonly previewObjectFit: ObjectFitMode;
  readonly previewFillScreen: boolean;
  readonly urlReviewStatusLimit: number;
  readonly clearUrlReviewStatusAfterExport: boolean;
  readonly neighborPreloadEnabled: boolean;
  readonly neighborPreloadRadius: number;
  readonly neighborPreloadCacheLimit: number;
  readonly secondaryControlsOpen: boolean;
}

export const DEFAULT_LOCAL_SETTINGS: PlaintextLocalSettings = {
  schemaVersion: 1,
  showHistoryThumbnails: false,
  requestThrottleMs: DEFAULT_GOVERNOR_CONFIG.minimumIntervalMs,
  requestThrottleMaxRequests: DEFAULT_GOVERNOR_CONFIG.maxRequests,
  requestThrottleWindowMs: DEFAULT_GOVERNOR_CONFIG.windowMs,
  panelDock: 'right',
  visibleBookmarkSoftMax: 30,
  recentHistoryLimit: 30,
  recentHistoryOverflowBehavior: 'drop-oldest',
  bookmarkVisibilityScope: 'global',
  pinSaveStoragePreference: 'encrypted',
  privacyModeEnabled: false,
  previewObjectFit: DEFAULT_PREVIEW_OBJECT_FIT,
  previewFillScreen: true,
  urlReviewStatusLimit: DEFAULT_URL_REVIEW_STATUS_LIMIT,
  clearUrlReviewStatusAfterExport: false,
  neighborPreloadEnabled: false,
  neighborPreloadRadius: DEFAULT_NEIGHBOR_PRELOAD_RADIUS,
  neighborPreloadCacheLimit: DEFAULT_NEIGHBOR_PRELOAD_CACHE_LIMIT,
  secondaryControlsOpen: false,
};

export const LOCAL_SETTINGS_KEY = 'imageTrail.localSettings';

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
    requestThrottleMaxRequests: isSafeThrottleMaxRequests(input.requestThrottleMaxRequests)
      ? input.requestThrottleMaxRequests
      : DEFAULT_LOCAL_SETTINGS.requestThrottleMaxRequests,
    requestThrottleWindowMs: isSafeThrottleWindow(input.requestThrottleWindowMs)
      ? input.requestThrottleWindowMs
      : DEFAULT_LOCAL_SETTINGS.requestThrottleWindowMs,
    panelDock: input.panelDock === 'left' ? 'left' : 'right',
    visibleBookmarkSoftMax: isSafeVisibleBookmarkSoftMax(input.visibleBookmarkSoftMax)
      ? input.visibleBookmarkSoftMax
      : DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
    recentHistoryLimit: isSafeRecentHistoryLimit(input.recentHistoryLimit)
      ? input.recentHistoryLimit
      : DEFAULT_LOCAL_SETTINGS.recentHistoryLimit,
    recentHistoryOverflowBehavior: isRecentHistoryOverflowBehavior(input.recentHistoryOverflowBehavior)
      ? input.recentHistoryOverflowBehavior
      : DEFAULT_LOCAL_SETTINGS.recentHistoryOverflowBehavior,
    bookmarkVisibilityScope: input.bookmarkVisibilityScope === 'site' ? 'site' : 'global',
    pinSaveStoragePreference: isPinSaveStoragePreference(input.pinSaveStoragePreference)
      ? input.pinSaveStoragePreference
      : DEFAULT_LOCAL_SETTINGS.pinSaveStoragePreference,
    privacyModeEnabled: input.privacyModeEnabled === true,
    previewObjectFit: isObjectFitMode(input.previewObjectFit) ? input.previewObjectFit : DEFAULT_LOCAL_SETTINGS.previewObjectFit,
    previewFillScreen: input.previewFillScreen !== false,
    urlReviewStatusLimit: isSafeUrlReviewStatusLimit(input.urlReviewStatusLimit)
      ? input.urlReviewStatusLimit
      : DEFAULT_LOCAL_SETTINGS.urlReviewStatusLimit,
    clearUrlReviewStatusAfterExport: input.clearUrlReviewStatusAfterExport === true,
    neighborPreloadEnabled: input.neighborPreloadEnabled === true,
    neighborPreloadRadius: isSafeNeighborPreloadRadius(input.neighborPreloadRadius)
      ? input.neighborPreloadRadius
      : DEFAULT_LOCAL_SETTINGS.neighborPreloadRadius,
    neighborPreloadCacheLimit: isSafeNeighborPreloadCacheLimit(input.neighborPreloadCacheLimit)
      ? input.neighborPreloadCacheLimit
      : DEFAULT_LOCAL_SETTINGS.neighborPreloadCacheLimit,
    secondaryControlsOpen: input.secondaryControlsOpen === true,
  };
}

export function isPinSaveStoragePreference(value: unknown): value is PinSaveStoragePreference {
  return value === 'encrypted' || value === 'plaintext';
}

export function isRecentHistoryOverflowBehavior(value: unknown): value is RecentHistoryOverflowBehavior {
  return value === 'drop-oldest' || value === 'keep-session';
}

function isSafeThrottle(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.min &&
    value <= REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.max
  );
}

function isSafeThrottleMaxRequests(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.min &&
    value <= REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.max
  );
}

function isSafeThrottleWindow(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= REQUEST_THROTTLE_WINDOW_LIMITS.min &&
    value <= REQUEST_THROTTLE_WINDOW_LIMITS.max
  );
}

function isSafeVisibleBookmarkSoftMax(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.min &&
    value <= VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.max
  );
}

function isSafeRecentHistoryLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= RECENT_HISTORY_LIMITS.min && value <= RECENT_HISTORY_LIMITS.max;
}

function isSafeUrlReviewStatusLimit(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= URL_REVIEW_STATUS_LIMITS.min && value <= URL_REVIEW_STATUS_LIMITS.max
  );
}

function isSafeNeighborPreloadRadius(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= NEIGHBOR_PRELOAD_RADIUS_LIMITS.min &&
    value <= NEIGHBOR_PRELOAD_RADIUS_LIMITS.max
  );
}

function isSafeNeighborPreloadCacheLimit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= NEIGHBOR_PRELOAD_CACHE_LIMITS.min &&
    value <= NEIGHBOR_PRELOAD_CACHE_LIMITS.max
  );
}
