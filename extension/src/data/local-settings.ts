import {
  DEFAULT_GALLERY_PAGE_LIMIT,
  DEFAULT_NEIGHBOR_PRELOAD_CACHE_LIMIT,
  DEFAULT_NEIGHBOR_PRELOAD_RADIUS,
  DEFAULT_URL_REVIEW_STATUS_LIMIT,
  GALLERY_PAGE_LIMITS,
  NEIGHBOR_PRELOAD_CACHE_LIMITS,
  NEIGHBOR_PRELOAD_RADIUS_LIMITS,
  RECENT_HISTORY_LIMITS,
  RECENT_HISTORY_RETAINED_LIMITS,
  REQUEST_THROTTLE_MAX_REQUESTS_LIMITS,
  REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS,
  REQUEST_THROTTLE_WINDOW_LIMITS,
  URL_REVIEW_STATUS_LIMITS,
  VISIBLE_BOOKMARK_SOFT_MAX_LIMITS,
  DEFAULT_LOAD_FAILURE_FEEDBACK,
  isLoadFailureFeedback,
  type LoadFailureFeedback,
} from '../core/settings.js';
import { DEFAULT_GOVERNOR_CONFIG } from '../core/automation/types.js';
import type { ImageProbeMethod } from '../core/image/request-policy.js';
import {
  DEFAULT_SEARCHABLE_METADATA_POLICY,
  sanitizeSearchableMetadataPolicy,
  type SearchableMetadataPolicy,
} from '../core/metadata-policy.js';
import { DEFAULT_PREVIEW_OBJECT_FIT, isObjectFitMode, type ObjectFitMode } from '../core/preview-style.js';
import type { PinSaveStoragePreference, RecentHistoryOverflowBehavior, RecentSparseRowDisplayMode } from '../core/types.js';
import {
  DEFAULT_QUEUE_DISPLAY_ORDER,
  DEFAULT_RECENT_DISPLAY_ORDER,
  isQueueDisplayOrder,
  isRecentDisplayOrder,
  type QueueDisplayOrder,
  type RecentDisplayOrder,
} from '../core/display-order.js';

export interface PlaintextLocalSettings {
  readonly schemaVersion: 1;
  readonly showHistoryThumbnails: boolean;
  readonly requestThrottleMs: number;
  readonly requestThrottleMaxRequests: number;
  readonly requestThrottleWindowMs: number;
  readonly panelDock: 'right' | 'left';
  readonly visibleBookmarkSoftMax: number;
  readonly galleryPageLimit: number;
  readonly recentHistoryLimit: number;
  readonly recentHistoryRetainedLimit: number;
  readonly recentHistoryOverflowBehavior: RecentHistoryOverflowBehavior;
  readonly recentSparseRowDisplayMode: RecentSparseRowDisplayMode;
  readonly recentDisplayOrder: RecentDisplayOrder;
  readonly bookmarkVisibilityScope: 'global' | 'site';
  readonly queueDisplayOrder: QueueDisplayOrder;
  readonly pinSaveStoragePreference: PinSaveStoragePreference;
  readonly privacyModeEnabled: boolean;
  readonly searchableMetadataPolicy: SearchableMetadataPolicy;
  readonly buildInfoOverlayVisible: boolean;
  readonly previewObjectFit: ObjectFitMode;
  readonly previewFillScreen: boolean;
  readonly urlReviewStatusLimit: number;
  readonly clearUrlReviewStatusAfterExport: boolean;
  readonly neighborPreloadEnabled: boolean;
  readonly neighborPreloadRadius: number;
  readonly neighborPreloadCacheLimit: number;
  readonly neighborPreloadProbeMethod: ImageProbeMethod;
  readonly loadFailureFeedback: LoadFailureFeedback;
  readonly secondaryControlsOpen: boolean;
  readonly restoreWorkspaceLayout: boolean;
}

export const DEFAULT_LOCAL_SETTINGS: PlaintextLocalSettings = {
  schemaVersion: 1,
  showHistoryThumbnails: false,
  requestThrottleMs: DEFAULT_GOVERNOR_CONFIG.minimumIntervalMs,
  requestThrottleMaxRequests: DEFAULT_GOVERNOR_CONFIG.maxRequests,
  requestThrottleWindowMs: DEFAULT_GOVERNOR_CONFIG.windowMs,
  panelDock: 'right',
  visibleBookmarkSoftMax: 30,
  galleryPageLimit: DEFAULT_GALLERY_PAGE_LIMIT,
  recentHistoryLimit: 30,
  recentHistoryRetainedLimit: 30,
  recentHistoryOverflowBehavior: 'drop-oldest',
  recentSparseRowDisplayMode: 'adaptive',
  recentDisplayOrder: DEFAULT_RECENT_DISPLAY_ORDER,
  bookmarkVisibilityScope: 'global',
  queueDisplayOrder: DEFAULT_QUEUE_DISPLAY_ORDER,
  pinSaveStoragePreference: 'encrypted',
  privacyModeEnabled: false,
  searchableMetadataPolicy: DEFAULT_SEARCHABLE_METADATA_POLICY,
  buildInfoOverlayVisible: true,
  previewObjectFit: DEFAULT_PREVIEW_OBJECT_FIT,
  previewFillScreen: true,
  urlReviewStatusLimit: DEFAULT_URL_REVIEW_STATUS_LIMIT,
  clearUrlReviewStatusAfterExport: false,
  neighborPreloadEnabled: false,
  neighborPreloadRadius: DEFAULT_NEIGHBOR_PRELOAD_RADIUS,
  neighborPreloadCacheLimit: DEFAULT_NEIGHBOR_PRELOAD_CACHE_LIMIT,
  neighborPreloadProbeMethod: 'get',
  loadFailureFeedback: DEFAULT_LOAD_FAILURE_FEEDBACK,
  secondaryControlsOpen: false,
  restoreWorkspaceLayout: false,
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

export type LocalSettingsMigrationInput = {
  readonly [Key in keyof PlaintextLocalSettings]?: PlaintextLocalSettings[Key] | undefined;
};

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

export function migrateLocalSettings(input: LocalSettingsMigrationInput): PlaintextLocalSettings {
  const recentHistoryLimit = isSafeRecentHistoryLimit(input.recentHistoryLimit)
    ? input.recentHistoryLimit
    : DEFAULT_LOCAL_SETTINGS.recentHistoryLimit;
  const recentHistoryOverflowBehavior = isRecentHistoryOverflowBehavior(input.recentHistoryOverflowBehavior)
    ? input.recentHistoryOverflowBehavior
    : DEFAULT_LOCAL_SETTINGS.recentHistoryOverflowBehavior;
  const recentHistoryRetainedLimit = migrateRecentHistoryRetainedLimit(
    input.recentHistoryRetainedLimit,
    recentHistoryLimit,
    recentHistoryOverflowBehavior,
  );

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
    galleryPageLimit: migrateGalleryPageLimit(input.galleryPageLimit),
    recentHistoryLimit,
    recentHistoryRetainedLimit,
    recentHistoryOverflowBehavior,
    recentSparseRowDisplayMode: isRecentSparseRowDisplayMode(input.recentSparseRowDisplayMode)
      ? input.recentSparseRowDisplayMode
      : DEFAULT_LOCAL_SETTINGS.recentSparseRowDisplayMode,
    recentDisplayOrder: isRecentDisplayOrder(input.recentDisplayOrder) ? input.recentDisplayOrder : DEFAULT_RECENT_DISPLAY_ORDER,
    bookmarkVisibilityScope: input.bookmarkVisibilityScope === 'site' ? 'site' : 'global',
    queueDisplayOrder: isQueueDisplayOrder(input.queueDisplayOrder) ? input.queueDisplayOrder : DEFAULT_QUEUE_DISPLAY_ORDER,
    pinSaveStoragePreference: isPinSaveStoragePreference(input.pinSaveStoragePreference)
      ? input.pinSaveStoragePreference
      : DEFAULT_LOCAL_SETTINGS.pinSaveStoragePreference,
    privacyModeEnabled: input.privacyModeEnabled === true,
    searchableMetadataPolicy: sanitizeSearchableMetadataPolicy(input.searchableMetadataPolicy),
    buildInfoOverlayVisible: input.buildInfoOverlayVisible !== false,
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
    neighborPreloadProbeMethod: isImageProbeMethod(input.neighborPreloadProbeMethod)
      ? input.neighborPreloadProbeMethod
      : DEFAULT_LOCAL_SETTINGS.neighborPreloadProbeMethod,
    loadFailureFeedback: isLoadFailureFeedback(input.loadFailureFeedback)
      ? input.loadFailureFeedback
      : DEFAULT_LOCAL_SETTINGS.loadFailureFeedback,
    secondaryControlsOpen: input.secondaryControlsOpen === true,
    restoreWorkspaceLayout: input.restoreWorkspaceLayout === true,
  };
}

export function isImageProbeMethod(value: unknown): value is ImageProbeMethod {
  return value === 'get' || value === 'head';
}

export function isPinSaveStoragePreference(value: unknown): value is PinSaveStoragePreference {
  return value === 'encrypted' || value === 'plaintext';
}

export function isRecentHistoryOverflowBehavior(value: unknown): value is RecentHistoryOverflowBehavior {
  return value === 'drop-oldest' || value === 'keep-session';
}

export function isRecentSparseRowDisplayMode(value: unknown): value is RecentSparseRowDisplayMode {
  return value === 'adaptive' || value === 'full' || value === 'half' || value === 'compact';
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

function isSafeGalleryPageLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= GALLERY_PAGE_LIMITS.min && value <= GALLERY_PAGE_LIMITS.max;
}

function migrateGalleryPageLimit(value: unknown): number {
  return isSafeGalleryPageLimit(value) ? value : DEFAULT_LOCAL_SETTINGS.galleryPageLimit;
}

function isSafeRecentHistoryLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= RECENT_HISTORY_LIMITS.min && value <= RECENT_HISTORY_LIMITS.max;
}

function isSafeRecentHistoryRetainedLimit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= RECENT_HISTORY_RETAINED_LIMITS.min &&
    value <= RECENT_HISTORY_RETAINED_LIMITS.max
  );
}

function migrateRecentHistoryRetainedLimit(value: unknown, visibleLimit: number, overflowBehavior: RecentHistoryOverflowBehavior): number {
  if (isSafeRecentHistoryRetainedLimit(value)) return Math.max(value, visibleLimit);
  if (value === undefined) {
    return overflowBehavior === 'keep-session' ? RECENT_HISTORY_RETAINED_LIMITS.max : visibleLimit;
  }
  return Math.max(DEFAULT_LOCAL_SETTINGS.recentHistoryRetainedLimit, visibleLimit);
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
