import type { ActionEntries, AnyActionDef } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type PanelSettingsActionName =
  | 'panel/secondary-controls-open'
  | 'panel/history-section-open'
  | 'panel/bookmarks-section-open'
  | 'panel/minimize'
  | 'panel/expand'
  | 'settings/toggle'
  | 'help/toggle'
  | 'settings/update-visible-bookmark-soft-max'
  | 'settings/update-recent-history-retention'
  | 'settings/update-pin-save-storage-preference'
  | 'settings/update-privacy-mode'
  | 'settings/update-metadata-policy'
  | 'settings/update-build-info-overlay-visibility'
  | 'settings/update-url-review-status-retention'
  | 'settings/update-request-throttle'
  | 'settings/update-neighbor-preload'
  | 'neighbor-preload/manual'
  | 'settings/reset-panel-position'
  | 'settings/update-workspace-layout-restore'
  | 'settings/reset-workspace-layout';

/** Panel chrome (minimize/expand, secondary controls) and the settings drawer. Bodies moved verbatim from the panel dispatch chain. */
export function buildPanelSettingsActionEntries(deps: PanelActionDeps): ActionEntries<PanelSettingsActionName> {
  // Shared by minimize/expand; the per-name conditionals around the common remount sequence are
  // preserved from the chain (minimize saves field state first, expand restores it last).
  const minimizeOrExpand: AnyActionDef = {
    handle(action) {
      if (action.name === 'panel/minimize') void deps.fieldStateSync().save();
      deps.reduce(action);
      deps.panelMount().mount();
      deps.keyboard().enable();
      deps.pageAdapter().enableBookmarkShortcut();
      deps.render();
      if (action.name === 'panel/expand') deps.restoreParsedFieldStateForCurrentPanel();
    },
  };
  return {
    'panel/secondary-controls-open': {
      handle(action) {
        if (deps.getState().secondaryControlsOpen === action.open) return;
        deps.reduce(action);
        deps.saveLocalSettings({ ...deps.getLocalSettings(), secondaryControlsOpen: action.open });
        deps.render();
      },
    },
    // Session-local collapse for the Recents/Queue sections (#438); durable persistence is an
    // explicit follow-up if wanted.
    'panel/history-section-open': {
      handle(action) {
        if (deps.getState().historySectionOpen === action.open) return;
        deps.reduce(action);
        deps.render();
      },
    },
    'panel/bookmarks-section-open': {
      handle(action) {
        if (deps.getState().bookmarksSectionOpen === action.open) return;
        deps.reduce(action);
        deps.render();
      },
    },
    'panel/minimize': minimizeOrExpand,
    'panel/expand': minimizeOrExpand,
    'settings/toggle': {
      handle(action) {
        deps.reduce(action);
        deps.render();
        if (deps.getState().settingsOpen) void deps.refreshStorageUsage({ render: true });
      },
    },
    'help/toggle': {
      handle(action) {
        deps.reduce(action);
        deps.render();
      },
    },
    'settings/update-visible-bookmark-soft-max': {
      handle(action) {
        void deps.updateVisibleBookmarkSoftMax(action.value);
      },
    },
    'settings/update-recent-history-retention': {
      handle(action) {
        void deps.updateRecentHistoryRetention({
          limit: action.limit,
          retainedLimit: action.retainedLimit,
          overflowBehavior: action.overflowBehavior,
        });
      },
    },
    'settings/update-pin-save-storage-preference': {
      handle(action) {
        deps.updatePinSaveStoragePreference(action.value);
      },
    },
    'settings/update-privacy-mode': {
      handle(action) {
        deps.reduce(action);
        deps.saveLocalSettings({ ...deps.getLocalSettings(), privacyModeEnabled: action.enabled });
        deps.render();
        deps.refreshRecallIfOpen();
      },
    },
    // At-rest searchable-metadata policy (#451). Persisting the setting is enough here: the background
    // applies the policy to durable records (hashing/redaction) when it stores the new settings, and
    // display reads the decrypted payload, so no recall refresh is needed.
    'settings/update-metadata-policy': {
      handle(action) {
        deps.reduce(action);
        deps.saveLocalSettings({ ...deps.getLocalSettings(), searchableMetadataPolicy: action.policy });
        deps.render();
      },
    },
    'settings/update-build-info-overlay-visibility': {
      handle(action) {
        deps.reduce(action);
        deps.saveLocalSettings({ ...deps.getLocalSettings(), buildInfoOverlayVisible: action.visible });
        deps.applyBuildInfoOverlayVisibility(action.visible);
        deps.render();
      },
    },
    'settings/update-url-review-status-retention': {
      handle(action) {
        void deps.updateUrlReviewStatusRetention(action.limit, action.clearAfterExport);
      },
    },
    'settings/update-request-throttle': {
      handle(action) {
        deps.updateRequestThrottle(action.minimumIntervalMs, action.maxRequests, action.windowMs);
      },
    },
    'settings/update-neighbor-preload': {
      handle(action) {
        deps.updateNeighborPreload(action.enabled, action.radius, action.cacheLimit, action.probeMethod, action.loadFailureFeedback);
      },
    },
    'neighbor-preload/manual': {
      handle(action) {
        deps.preloadMoreNeighbors(action.radius, action.cacheLimit);
      },
    },
    'settings/reset-panel-position': {
      handle() {
        void deps.resetPanelPosition();
      },
    },
    'settings/update-workspace-layout-restore': {
      handle(action) {
        deps.updateWorkspaceLayoutRestore(action.enabled);
      },
    },
    'settings/reset-workspace-layout': {
      handle() {
        void deps.resetWorkspaceLayout();
      },
    },
  };
}
