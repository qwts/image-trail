import type { PageAdapter } from '../../content/page-adapter.js';
import { DEFAULT_LOCAL_SETTINGS, type LocalSettingsStore, type PlaintextLocalSettings } from '../../content/panel-services.js';
import type { RequestGovernor } from '../../content/request-governor.js';
import { reducePanelAction } from '../../core/actions.js';
import {
  NEIGHBOR_PRELOAD_CACHE_LIMITS,
  NEIGHBOR_PRELOAD_RADIUS_LIMITS,
  RECENT_HISTORY_LIMITS,
  RECENT_HISTORY_RETAINED_LIMITS,
  REQUEST_THROTTLE_MAX_REQUESTS_LIMITS,
  REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS,
  REQUEST_THROTTLE_WINDOW_LIMITS,
  URL_REVIEW_STATUS_LIMITS,
  VISIBLE_BOOKMARK_SOFT_MAX_LIMITS,
} from '../../core/settings.js';
import { setTargetState } from '../../core/state.js';
import type { PanelState } from '../../core/types.js';
import { collectUrlFields } from '../../core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../../core/url/types.js';
import type { NeighborPreloadController } from './neighbor-preload-controller.js';
import { toTargetState } from './projection-application-controller.js';

export interface PanelSettingsControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  // `localSettings` stays panel-owned (every collaborator reads it through its own `getLocalSettings`
  // dep); this controller is the sole writer, mutating it through `setLocalSettings` so there is no
  // second source of truth.
  getLocalSettings(): PlaintextLocalSettings;
  setLocalSettings(settings: PlaintextLocalSettings): void;
  render(): void;
  renderPanelAndRefreshRecall(): void;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  loadRecentHistory(options?: { readonly render?: boolean }): Promise<void>;
  // Parsed-field navigation helpers stay panel-owned (the nav queue slice consumes them too); only
  // `preloadMoreNeighbors` reaches them here.
  currentNavigationBaseModel(): ParsedUrlModel;
  includedNavigationFields(fields: readonly UrlField[]): readonly UrlField[];
  localSettingsStore(): LocalSettingsStore | null;
  // Collaborators are Pick-typed so test fakes compile despite the classes' private members.
  governor(): Pick<RequestGovernor, 'updateConfig'>;
  neighborPreload(): Pick<NeighborPreloadController, 'invalidate' | 'pruneCache' | 'isActive' | 'preloadMore'>;
  pageAdapter(): Pick<PageAdapter, 'setPreviewPreferences'>;
  onLocalSettingsLoaded?(): void;
}

interface LoadLocalSettingsOptions {
  readonly render?: boolean;
  readonly reloadQueue?: boolean;
}

function queueViewSettingsChanged(state: PanelState, settings: PlaintextLocalSettings): boolean {
  return (
    state.bookmarkLimit !== settings.visibleBookmarkSoftMax ||
    state.bookmarkVisibilityScope !== settings.bookmarkVisibilityScope ||
    state.queueDisplayOrder !== settings.queueDisplayOrder
  );
}

/**
 * Local-settings load/save plus the per-setting update handlers, moved verbatim off `ImageTrailPanel`.
 * Each `update*` handler validates the incoming value against its `*_LIMITS`, no-ops when the value is
 * unchanged/out-of-range, reduces the matching settings action, persists via `localSettingsStore`, and
 * fans the relevant side effect into a collaborator (`governor.updateConfig`, `neighborPreload`
 * invalidate/prune, `pageAdapter.setPreviewPreferences`). Preserve each guard's early return and the
 * "side effect fires only on an actual change" ordering.
 */
export class PanelSettingsController {
  constructor(private readonly deps: PanelSettingsControllerDeps) {}

  async loadLocalSettings(options: LoadLocalSettingsOptions = {}): Promise<void> {
    const store = this.deps.localSettingsStore();
    const settings = store ? await store.load() : DEFAULT_LOCAL_SETTINGS;
    this.deps.setLocalSettings(settings);
    const state = this.deps.getState();
    const reloadQueue = options.reloadQueue === true && queueViewSettingsChanged(state, settings);
    const history = state.history.slice(0, settings.recentHistoryLimit);
    this.deps.setState({
      ...state,
      history,
      selectedHistoryIds: state.selectedHistoryIds.filter((id) => history.some((item) => item.id === id)),
      bookmarkVisibilityScope: settings.bookmarkVisibilityScope,
      bookmarkLimit: settings.visibleBookmarkSoftMax,
      recentHistoryLimit: settings.recentHistoryLimit,
      recentHistoryRetainedLimit: settings.recentHistoryRetainedLimit,
      recentHistoryOverflowBehavior: settings.recentHistoryOverflowBehavior,
      recentSparseRowDisplayMode: settings.recentSparseRowDisplayMode,
      recentDisplayOrder: settings.recentDisplayOrder,
      pinSaveStoragePreference: settings.pinSaveStoragePreference,
      queueDisplayOrder: settings.queueDisplayOrder,
      privacyModeEnabled: settings.privacyModeEnabled,
      searchableMetadataPolicy: settings.searchableMetadataPolicy,
      buildInfoOverlayVisible: settings.buildInfoOverlayVisible,
      urlReviewStatusLimit: settings.urlReviewStatusLimit,
      clearUrlReviewStatusAfterExport: settings.clearUrlReviewStatusAfterExport,
      requestThrottleMs: settings.requestThrottleMs,
      requestThrottleMaxRequests: settings.requestThrottleMaxRequests,
      requestThrottleWindowMs: settings.requestThrottleWindowMs,
      neighborPreloadEnabled: settings.neighborPreloadEnabled,
      neighborPreloadRadius: settings.neighborPreloadRadius,
      neighborPreloadCacheLimit: settings.neighborPreloadCacheLimit,
      neighborPreloadProbeMethod: settings.neighborPreloadProbeMethod,
      loadFailureFeedback: settings.loadFailureFeedback,
      downArrowAction: settings.downArrowAction,
      secondaryControlsOpen: settings.secondaryControlsOpen,
      restoreWorkspaceLayoutEnabled: settings.restoreWorkspaceLayout,
      lastUpdatedAt: Date.now(),
    });
    this.deps.governor().updateConfig({
      minimumIntervalMs: settings.requestThrottleMs,
      maxRequests: settings.requestThrottleMaxRequests,
      windowMs: settings.requestThrottleWindowMs,
    });
    const snapshot = this.deps.pageAdapter().setPreviewPreferences({
      fillScreen: settings.previewFillScreen,
      objectFit: settings.previewObjectFit,
    });
    this.deps.setState(setTargetState(this.deps.getState(), toTargetState(snapshot)));
    // The workspace-layout restore is gated on the opt-in flag that just landed in state.
    this.deps.onLocalSettingsLoaded?.();
    if (reloadQueue) await this.deps.loadBookmarkPage(0, { render: false });
    if (options.render === false) return;
    if (reloadQueue) {
      this.deps.renderPanelAndRefreshRecall();
      return;
    }
    this.deps.render();
  }

  saveLocalSettings(settings: PlaintextLocalSettings): void {
    void this.saveLocalSettingsAsync(settings);
  }

  async saveLocalSettingsAsync(settings: PlaintextLocalSettings): Promise<void> {
    this.deps.setLocalSettings(settings);
    await this.deps.localSettingsStore()?.save(settings);
  }

  async updateVisibleBookmarkSoftMax(value: number): Promise<void> {
    if (
      !Number.isInteger(value) ||
      value < VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.min ||
      value > VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.max ||
      value === this.deps.getState().bookmarkLimit
    ) {
      return;
    }
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'settings/update-visible-bookmark-soft-max', value }));
    this.saveLocalSettings({ ...this.deps.getLocalSettings(), visibleBookmarkSoftMax: value });
    await this.deps.loadBookmarkPage(0, { render: false });
    this.deps.renderPanelAndRefreshRecall();
  }

  async updateRecentHistoryRetention(input: {
    readonly limit: number;
    readonly retainedLimit: number;
    readonly overflowBehavior: PlaintextLocalSettings['recentHistoryOverflowBehavior'];
  }): Promise<void> {
    const retainedLimit = Math.max(input.retainedLimit, input.limit);
    if (
      !Number.isInteger(input.limit) ||
      !Number.isInteger(input.retainedLimit) ||
      input.limit < RECENT_HISTORY_LIMITS.min ||
      input.limit > RECENT_HISTORY_LIMITS.max ||
      input.retainedLimit < RECENT_HISTORY_RETAINED_LIMITS.min ||
      input.retainedLimit > RECENT_HISTORY_RETAINED_LIMITS.max ||
      (input.limit === this.deps.getState().recentHistoryLimit &&
        retainedLimit === this.deps.getState().recentHistoryRetainedLimit &&
        input.overflowBehavior === this.deps.getState().recentHistoryOverflowBehavior)
    ) {
      return;
    }
    const previousLimit = this.deps.getState().recentHistoryLimit;
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'settings/update-recent-history-retention',
        limit: input.limit,
        retainedLimit,
        overflowBehavior: input.overflowBehavior,
      }),
    );
    await this.saveLocalSettingsAsync({
      ...this.deps.getLocalSettings(),
      recentHistoryLimit: input.limit,
      recentHistoryRetainedLimit: retainedLimit,
      recentHistoryOverflowBehavior: input.overflowBehavior,
    });
    if (input.limit > previousLimit && input.overflowBehavior === 'keep-session') {
      await this.deps.loadRecentHistory();
      return;
    }
    this.deps.render();
  }

  updateRecentSparseRowDisplayMode(mode: PlaintextLocalSettings['recentSparseRowDisplayMode']): void {
    if (mode === this.deps.getState().recentSparseRowDisplayMode) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'settings/update-recent-sparse-row-display-mode', mode }));
    this.saveLocalSettings({ ...this.deps.getLocalSettings(), recentSparseRowDisplayMode: mode });
    this.deps.render();
  }

  updateDownArrowAction(value: PlaintextLocalSettings['downArrowAction']): void {
    if (value === this.deps.getState().downArrowAction) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'settings/update-down-arrow-action', value }));
    this.saveLocalSettings({ ...this.deps.getLocalSettings(), downArrowAction: value });
    this.deps.render();
  }

  updatePinSaveStoragePreference(value: PlaintextLocalSettings['pinSaveStoragePreference']): void {
    if (value === this.deps.getState().pinSaveStoragePreference) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'settings/update-pin-save-storage-preference', value }));
    this.saveLocalSettings({ ...this.deps.getLocalSettings(), pinSaveStoragePreference: value });
    this.deps.render();
  }

  async updateUrlReviewStatusRetention(limit: number, clearAfterExport: boolean): Promise<void> {
    if (
      !Number.isInteger(limit) ||
      limit < URL_REVIEW_STATUS_LIMITS.min ||
      limit > URL_REVIEW_STATUS_LIMITS.max ||
      (limit === this.deps.getState().urlReviewStatusLimit && clearAfterExport === this.deps.getState().clearUrlReviewStatusAfterExport)
    ) {
      return;
    }
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'settings/update-url-review-status-retention',
        limit,
        clearAfterExport,
      }),
    );
    await this.saveLocalSettingsAsync({
      ...this.deps.getLocalSettings(),
      urlReviewStatusLimit: limit,
      clearUrlReviewStatusAfterExport: clearAfterExport,
    });
    this.deps.render();
  }

  updateRequestThrottle(minimumIntervalMs: number, maxRequests: number, windowMs: number): void {
    if (
      !Number.isInteger(minimumIntervalMs) ||
      minimumIntervalMs < REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.min ||
      minimumIntervalMs > REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.max ||
      !Number.isInteger(maxRequests) ||
      maxRequests < REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.min ||
      maxRequests > REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.max ||
      !Number.isInteger(windowMs) ||
      windowMs < REQUEST_THROTTLE_WINDOW_LIMITS.min ||
      windowMs > REQUEST_THROTTLE_WINDOW_LIMITS.max ||
      (minimumIntervalMs === this.deps.getState().requestThrottleMs &&
        maxRequests === this.deps.getState().requestThrottleMaxRequests &&
        windowMs === this.deps.getState().requestThrottleWindowMs)
    ) {
      return;
    }
    this.deps.setState(
      reducePanelAction(this.deps.getState(), { name: 'settings/update-request-throttle', minimumIntervalMs, maxRequests, windowMs }),
    );
    this.deps.governor().updateConfig({ minimumIntervalMs, maxRequests, windowMs });
    this.saveLocalSettings({
      ...this.deps.getLocalSettings(),
      requestThrottleMs: minimumIntervalMs,
      requestThrottleMaxRequests: maxRequests,
      requestThrottleWindowMs: windowMs,
    });
    this.deps.render();
  }

  updateNeighborPreload(
    enabled: boolean,
    radius: number,
    cacheLimit: number,
    probeMethod = this.deps.getLocalSettings().neighborPreloadProbeMethod,
    loadFailureFeedback = this.deps.getLocalSettings().loadFailureFeedback,
  ): void {
    if (
      !Number.isInteger(radius) ||
      radius < NEIGHBOR_PRELOAD_RADIUS_LIMITS.min ||
      radius > NEIGHBOR_PRELOAD_RADIUS_LIMITS.max ||
      !Number.isInteger(cacheLimit) ||
      cacheLimit < NEIGHBOR_PRELOAD_CACHE_LIMITS.min ||
      cacheLimit > NEIGHBOR_PRELOAD_CACHE_LIMITS.max ||
      (enabled === this.deps.getState().neighborPreloadEnabled &&
        radius === this.deps.getState().neighborPreloadRadius &&
        cacheLimit === this.deps.getState().neighborPreloadCacheLimit &&
        probeMethod === this.deps.getState().neighborPreloadProbeMethod &&
        loadFailureFeedback === this.deps.getState().loadFailureFeedback)
    ) {
      return;
    }
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'settings/update-neighbor-preload',
        enabled,
        radius,
        cacheLimit,
        probeMethod,
        loadFailureFeedback,
      }),
    );
    this.saveLocalSettings({
      ...this.deps.getLocalSettings(),
      neighborPreloadEnabled: enabled,
      neighborPreloadRadius: radius,
      neighborPreloadCacheLimit: cacheLimit,
      neighborPreloadProbeMethod: probeMethod,
      loadFailureFeedback,
    });
    if (!enabled || radius === 0) {
      this.deps.neighborPreload().invalidate();
    }
    this.deps.neighborPreload().pruneCache();
    this.deps.render();
  }

  preloadMoreNeighbors(radius: number, cacheLimit: number): void {
    this.updateNeighborPreload(true, radius, cacheLimit);
    if (!this.deps.neighborPreload().isActive) return;
    let model: ParsedUrlModel;
    try {
      model = this.deps.currentNavigationBaseModel();
    } catch {
      return;
    }
    const fields = this.deps.includedNavigationFields(collectUrlFields(model));
    if (fields.length === 0) return;
    const result = this.deps.neighborPreload().preloadMore(model, fields);
    if (!result) {
      this.deps.setState({
        ...this.deps.getState(),
        status: 'ready',
        message: 'No additional parsed-field preload candidates found.',
        lastUpdatedAt: Date.now(),
      });
      this.deps.render();
      return;
    }
    this.deps.setState({
      ...this.deps.getState(),
      status: 'ready',
      message: `Preloading ${result.candidateCount} more parsed-field neighbor image(s)...`,
      lastUpdatedAt: Date.now(),
    });
    this.deps.render();
  }
}
