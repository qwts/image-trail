import type { AutomationState, PanelState, RecallState, TargetState } from './types.js';
import { DEFAULT_NEIGHBOR_PRELOAD_CACHE_LIMIT, DEFAULT_NEIGHBOR_PRELOAD_RADIUS, DEFAULT_URL_REVIEW_STATUS_LIMIT } from './settings.js';
import { DEFAULT_GOVERNOR_CONFIG } from './automation/types.js';
import { DEFAULT_PREVIEW_OBJECT_FIT } from './preview-style.js';

export const EMPTY_TARGET_STATE: TargetState = {
  mode: 'none',
  picking: false,
  grabModeActive: false,
  candidateCount: 0,
  selectedUrl: null,
  selectedHandleId: null,
  selectedDimensions: null,
  fillScreen: true,
  objectFit: DEFAULT_PREVIEW_OBJECT_FIT,
  message: 'No target selected.',
};

export const EMPTY_AUTOMATION_STATE: AutomationState = {
  slideshowPhase: 'idle',
  slideshowCount: 0,
  retryPhase: 'idle',
  retriesUsed: 0,
  retriesMax: 3,
  governorStatus: 'ready',
  requestsInWindow: 0,
};

export const EMPTY_RECALL_STATE: RecallState = {
  open: false,
  busy: false,
  side: 'right',
  candidates: [],
  selectedIds: [],
  offset: 0,
  nextOffset: 0,
  hasMore: false,
  total: 0,
  failedCount: 0,
};

export function createInitialPanelState(now = Date.now()): PanelState {
  return {
    visible: false,
    minimized: false,
    status: 'idle',
    message: 'Image Trail is ready.',
    lastUpdatedAt: now,
    target: EMPTY_TARGET_STATE,
    draftUrl: null,
    history: [],
    recentHistoryLimit: 30,
    recentHistoryRetainedLimit: 30,
    recentHistoryOverflowBehavior: 'drop-oldest',
    bookmarks: [],
    bookmarkOffset: 0,
    bookmarkLimit: 30,
    bookmarkTotal: 0,
    bookmarkVisibilityScope: 'global',
    pinSaveStoragePreference: 'encrypted',
    privacyModeEnabled: false,
    buildInfoOverlayVisible: true,
    urlReviewStatusLimit: DEFAULT_URL_REVIEW_STATUS_LIMIT,
    clearUrlReviewStatusAfterExport: false,
    requestThrottleMs: DEFAULT_GOVERNOR_CONFIG.minimumIntervalMs,
    requestThrottleMaxRequests: DEFAULT_GOVERNOR_CONFIG.maxRequests,
    requestThrottleWindowMs: DEFAULT_GOVERNOR_CONFIG.windowMs,
    neighborPreloadEnabled: false,
    neighborPreloadRadius: DEFAULT_NEIGHBOR_PRELOAD_RADIUS,
    neighborPreloadCacheLimit: DEFAULT_NEIGHBOR_PRELOAD_CACHE_LIMIT,
    neighborPreloadProbeMethod: 'get',
    secondaryControlsOpen: false,
    hasOlderBookmarks: false,
    hasNewerBookmarks: false,
    captureInProgress: false,
    captureResult: null,
    storageUsage: null,
    buildIdentity: null,
    blobKeyUnlocked: false,
    blobKeyAvailable: false,
    blobKeyReference: null,
    importExportBusy: false,
    pcloudBackup: {
      connectionState: 'disconnected',
    },
    settingsOpen: false,
    automation: EMPTY_AUTOMATION_STATE,
    recall: EMPTY_RECALL_STATE,
    selectedHistoryIds: [],
    selectedBookmarkIds: [],
    activeFieldId: null,
    failedFieldId: null,
    successfulFieldIds: [],
    unchangedFieldIds: [],
    unlockedFieldIds: [],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    fieldDigitWidthSpecs: [],
    urlTemplates: [],
    grabSourcePatterns: [],
    activeUrlTemplateId: null,
    currentImageFingerprint: null,
  };
}

export function showPanel(state: PanelState, now = Date.now()): PanelState {
  return { ...state, visible: true, status: 'ready', message: 'Panel connected. Target selection is ready.', lastUpdatedAt: now };
}

export function closePanel(state: PanelState, now = Date.now()): PanelState {
  return {
    ...state,
    visible: false,
    minimized: false,
    status: 'closed',
    message: 'Panel closed.',
    lastUpdatedAt: now,
    target: { ...state.target, picking: false },
  };
}

export function setTargetState(state: PanelState, target: TargetState, now = Date.now()): PanelState {
  const targetChanged = state.target.selectedHandleId !== target.selectedHandleId || target.selectedUrl === null;
  return {
    ...state,
    status: target.picking ? 'picking' : 'ready',
    message: target.message,
    target,
    draftUrl: targetChanged ? null : state.draftUrl,
    failedFieldId: targetChanged ? null : state.failedFieldId,
    successfulFieldIds: targetChanged ? [] : state.successfulFieldIds,
    unchangedFieldIds: targetChanged ? [] : state.unchangedFieldIds,
    unlockedFieldIds: targetChanged ? [] : state.unlockedFieldIds,
    manuallyExcludedFieldIds: targetChanged ? [] : state.manuallyExcludedFieldIds,
    fieldSplitSpecs: targetChanged ? [] : state.fieldSplitSpecs,
    fieldDigitWidthSpecs: targetChanged ? [] : state.fieldDigitWidthSpecs,
    activeUrlTemplateId: targetChanged ? null : state.activeUrlTemplateId,
    currentImageFingerprint: targetChanged ? null : state.currentImageFingerprint,
    lastUpdatedAt: now,
  };
}

export function setAutomationState(state: PanelState, automation: Partial<AutomationState>, now = Date.now()): PanelState {
  return {
    ...state,
    automation: { ...state.automation, ...automation },
    lastUpdatedAt: now,
  };
}
