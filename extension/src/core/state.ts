import type { AutomationState, PanelState, RecallState, TargetState } from './types.js';
import {
  DEFAULT_LOAD_FAILURE_FEEDBACK,
  DEFAULT_NEIGHBOR_PRELOAD_CACHE_LIMIT,
  DEFAULT_NEIGHBOR_PRELOAD_RADIUS,
  DEFAULT_URL_REVIEW_STATUS_LIMIT,
} from './settings.js';
import { DEFAULT_GOVERNOR_CONFIG } from './automation/types.js';
import { DEFAULT_SEARCHABLE_METADATA_POLICY } from './metadata-policy.js';
import { DEFAULT_QUEUE_DISPLAY_ORDER, DEFAULT_RECENT_DISPLAY_ORDER } from './display-order.js';
import { DEFAULT_PREVIEW_OBJECT_FIT } from './preview-style.js';
import { EMPTY_PAGE_CONTEXT_STATE } from './page-context.js';
import { DEFAULT_RECENT_HISTORY_SCOPE } from './recent-history-scope.js';

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
  navigationBusy: false,
};

export const EMPTY_RECALL_STATE: RecallState = {
  busy: false,
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
    pageContext: EMPTY_PAGE_CONTEXT_STATE,
    draftUrl: null,
    history: [],
    recentHistoryLimit: 30,
    recentHistoryRetainedLimit: 30,
    recentHistoryOverflowBehavior: 'drop-oldest',
    recentSparseRowDisplayMode: 'adaptive',
    recentDisplayOrder: DEFAULT_RECENT_DISPLAY_ORDER,
    recentHistoryScope: DEFAULT_RECENT_HISTORY_SCOPE,
    bookmarks: [],
    bookmarkOffset: 0,
    bookmarkLimit: 30,
    bookmarkTotal: 0,
    bookmarkVisibilityScope: 'global',
    queueDisplayOrder: DEFAULT_QUEUE_DISPLAY_ORDER,
    pinSaveStoragePreference: 'encrypted',
    blobKeyInactivityTimeoutMinutes: 10,
    privacyModeEnabled: false,
    searchableMetadataPolicy: DEFAULT_SEARCHABLE_METADATA_POLICY,
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
    loadFailureFeedback: DEFAULT_LOAD_FAILURE_FEEDBACK,
    downArrowAction: 'capture',
    secondaryControlsOpen: false,
    historySectionOpen: true,
    bookmarksSectionOpen: true,
    detachedSections: [],
    restoreWorkspaceLayoutEnabled: false,
    hasOlderBookmarks: false,
    hasNewerBookmarks: false,
    captureInProgress: false,
    captureResult: null,
    captureRetryRequest: null,
    storageUsage: null,
    buildIdentity: null,
    blobKeyUnlocked: false,
    blobKeyAvailable: false,
    blobKeyReference: null,
    importExportBusy: false,
    pcloudBackup: {
      connectionState: 'disconnected',
    },
    activeDestination: null,
    helpOpen: false,
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
    parsedFieldResetBaseline: null,
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
    activeDestination: null,
    helpOpen: false,
    status: 'closed',
    message: 'Panel closed.',
    lastUpdatedAt: now,
    target: { ...state.target, picking: false },
    recall: { ...state.recall, selectedIds: [] },
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
    parsedFieldResetBaseline: targetChanged ? null : state.parsedFieldResetBaseline,
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
