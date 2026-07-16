import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LOCAL_SETTINGS, type PlaintextLocalSettings } from '../extension/src/content/panel-services.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import type { ParsedUrlModel, UrlField } from '../extension/src/core/url/types.js';
import { PanelSettingsController, type PanelSettingsControllerDeps } from '../extension/src/ui/panel/panel-settings-controller.js';

// The settings controller touches neither `window` nor the DOM, so its validation guards, side-effect
// fan-out (governor / neighbor-preload / page-adapter), and persistence are all covered in this flat
// suite. tests/dom/panel-settings-controller.test.ts wires the `render` dep to real DOM under
// happy-dom to prove the settings flow drives a render as an integration.

interface Harness {
  readonly controller: PanelSettingsController;
  readonly log: string[];
  readonly saved: PlaintextLocalSettings[];
  readonly governorConfigs: { minimumIntervalMs: number; maxRequests: number; windowMs: number }[];
  readonly previewPrefs: { fillScreen: boolean; objectFit: string }[];
  getState(): PanelState;
  setState(next: PanelState): void;
  getLocalSettings(): PlaintextLocalSettings;
}

interface HarnessOptions {
  readonly hasStore?: boolean;
  readonly storeSettings?: PlaintextLocalSettings;
  readonly isActive?: boolean;
  readonly navFields?: readonly UrlField[];
  readonly navModel?: () => ParsedUrlModel;
  readonly preloadMoreResult?: { readonly candidateCount: number } | null;
}

function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  let localSettings: PlaintextLocalSettings = { ...DEFAULT_LOCAL_SETTINGS };
  const log: string[] = [];
  const saved: PlaintextLocalSettings[] = [];
  const governorConfigs: { minimumIntervalMs: number; maxRequests: number; windowMs: number }[] = [];
  const previewPrefs: { fillScreen: boolean; objectFit: string }[] = [];
  const defaultModel = parseUrl('https://images.example.test/photo?p=5');
  const deps: PanelSettingsControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    getLocalSettings: () => localSettings,
    setLocalSettings: (next) => {
      localSettings = next;
    },
    render: () => {
      log.push('render');
    },
    renderPanelAndRefreshRecall: () => {
      log.push('renderPanelAndRefreshRecall');
    },
    loadBookmarkPage: async (offset) => {
      log.push(`loadBookmarkPage:${offset}`);
    },
    loadRecentHistory: async () => {
      log.push('loadRecentHistory');
    },
    currentNavigationBaseModel: options.navModel ?? (() => defaultModel),
    includedNavigationFields: () => options.navFields ?? [],
    localSettingsStore:
      options.hasStore === false
        ? () => null
        : () => ({
            load: async () => options.storeSettings ?? DEFAULT_LOCAL_SETTINGS,
            save: async (settings) => {
              saved.push(settings);
            },
          }),
    governor: () => ({
      updateConfig: (config) => {
        governorConfigs.push({
          minimumIntervalMs: config.minimumIntervalMs ?? -1,
          maxRequests: config.maxRequests ?? -1,
          windowMs: config.windowMs ?? -1,
        });
      },
    }),
    neighborPreload: () => ({
      isActive: options.isActive ?? true,
      invalidate: () => {
        log.push('invalidate');
      },
      pruneCache: () => {
        log.push('pruneCache');
      },
      preloadMore: () => {
        log.push('preloadMore');
        return options.preloadMoreResult === undefined ? { candidateCount: 4 } : options.preloadMoreResult;
      },
    }),
    pageAdapter: () => ({
      setPreviewPreferences: (preferences) => {
        previewPrefs.push({ fillScreen: preferences.fillScreen, objectFit: preferences.objectFit });
        return {
          mode: 'none',
          picking: false,
          grabModeActive: false,
          candidateCount: 0,
          selected: null,
          fillScreen: preferences.fillScreen,
          objectFit: preferences.objectFit,
          message: '',
        };
      },
    }),
  };
  return {
    controller: new PanelSettingsController(deps),
    log,
    saved,
    governorConfigs,
    previewPrefs,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    getLocalSettings: () => localSettings,
  };
}

test('loadLocalSettings syncs state, governor, and preview prefs from the store, then renders', async () => {
  const harness = createHarness({
    storeSettings: {
      ...DEFAULT_LOCAL_SETTINGS,
      visibleBookmarkSoftMax: 12,
      blobKeyInactivityTimeoutMinutes: 15,
      buildInfoOverlayVisible: false,
      recentHistoryLimit: 2,
      recentHistoryRetainedLimit: 4,
      requestThrottleMs: 250,
      requestThrottleMaxRequests: 7,
      requestThrottleWindowMs: 9_000,
      neighborPreloadEnabled: true,
      neighborPreloadRadius: 4,
      downArrowAction: 'download',
      previewFillScreen: false,
      previewObjectFit: 'contain',
    },
  });
  // Seed a history longer than the incoming recentHistoryLimit to exercise the slice + selection filter.
  harness.setState({
    ...harness.getState(),
    history: [
      { id: 'a', url: 'https://x/a', timestamp: '3' },
      { id: 'b', url: 'https://x/b', timestamp: '2' },
      { id: 'c', url: 'https://x/c', timestamp: '1' },
    ],
    selectedHistoryIds: ['a', 'c'],
  });

  await harness.controller.loadLocalSettings();

  assert.equal(harness.getLocalSettings().visibleBookmarkSoftMax, 12);
  const state = harness.getState();
  assert.equal(state.bookmarkLimit, 12);
  assert.equal(state.blobKeyInactivityTimeoutMinutes, 15);
  assert.equal(state.buildInfoOverlayVisible, false);
  assert.equal(state.recentHistoryLimit, 2);
  assert.equal(state.recentHistoryRetainedLimit, 4);
  assert.equal(state.neighborPreloadEnabled, true);
  assert.equal(state.neighborPreloadRadius, 4);
  assert.equal(state.downArrowAction, 'download');
  assert.equal(state.history.length, 2, 'history is trimmed to the new recentHistoryLimit');
  assert.deepEqual(state.selectedHistoryIds, ['a'], 'selected ids that fall outside the trimmed history are dropped');
  assert.deepEqual(harness.governorConfigs, [{ minimumIntervalMs: 250, maxRequests: 7, windowMs: 9_000 }]);
  assert.deepEqual(harness.previewPrefs, [{ fillScreen: false, objectFit: 'contain' }]);
  assert.deepEqual(harness.log, ['render']);
});

test('loadLocalSettings honors { render: false } and falls back to defaults without a store', async () => {
  const harness = createHarness({ hasStore: false });
  await harness.controller.loadLocalSettings({ render: false });
  assert.deepEqual(harness.log, [], 'no render when render:false');
  assert.equal(harness.getLocalSettings().visibleBookmarkSoftMax, DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax);
  assert.equal(harness.getState().bookmarkLimit, DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax);
});

test('external queue-view settings reload page zero before refreshing the panel and Recall', async () => {
  const harness = createHarness({
    storeSettings: {
      ...DEFAULT_LOCAL_SETTINGS,
      visibleBookmarkSoftMax: 50,
      bookmarkVisibilityScope: 'site',
      queueDisplayOrder: 'back-first',
    },
  });

  await harness.controller.loadLocalSettings({ reloadQueue: true });

  assert.equal(harness.getState().bookmarkLimit, 50);
  assert.equal(harness.getState().bookmarkVisibilityScope, 'site');
  assert.equal(harness.getState().queueDisplayOrder, 'back-first');
  assert.deepEqual(harness.log, ['loadBookmarkPage:0', 'renderPanelAndRefreshRecall']);
});

test('external non-queue settings render without repaging bookmarks', async () => {
  const harness = createHarness({
    storeSettings: { ...DEFAULT_LOCAL_SETTINGS, privacyModeEnabled: true },
  });

  await harness.controller.loadLocalSettings({ reloadQueue: true });

  assert.equal(harness.getState().privacyModeEnabled, true);
  assert.deepEqual(harness.log, ['render']);
});

test('saveLocalSettingsAsync writes to the store and updates the owned localSettings', async () => {
  const harness = createHarness();
  const next: PlaintextLocalSettings = { ...DEFAULT_LOCAL_SETTINGS, privacyModeEnabled: true };
  await harness.controller.saveLocalSettingsAsync(next);
  assert.equal(harness.getLocalSettings().privacyModeEnabled, true);
  assert.deepEqual(harness.saved, [next]);
});

test('saveLocalSettingsAsync tolerates a missing store', async () => {
  const harness = createHarness({ hasStore: false });
  const next: PlaintextLocalSettings = { ...DEFAULT_LOCAL_SETTINGS, privacyModeEnabled: true };
  await harness.controller.saveLocalSettingsAsync(next);
  assert.equal(harness.getLocalSettings().privacyModeEnabled, true);
  assert.deepEqual(harness.saved, []);
});

test('updateVisibleBookmarkSoftMax no-ops when unchanged or out of range', async () => {
  for (const value of [30, 0, 201, 12.5]) {
    const harness = createHarness();
    await harness.controller.updateVisibleBookmarkSoftMax(value);
    assert.deepEqual(harness.log, [], `value ${value} must be a no-op`);
    assert.deepEqual(harness.saved, []);
  }
});

test('updateVisibleBookmarkSoftMax reloads the first page and refreshes recall on a real change', async () => {
  const harness = createHarness();
  await harness.controller.updateVisibleBookmarkSoftMax(50);
  assert.equal(harness.getState().bookmarkLimit, 50);
  assert.equal(harness.getLocalSettings().visibleBookmarkSoftMax, 50);
  assert.deepEqual(harness.log, ['loadBookmarkPage:0', 'renderPanelAndRefreshRecall']);
});

test('updateBlobKeyInactivityTimeout persists and renders a supported policy change', () => {
  const harness = createHarness();
  harness.controller.updateBlobKeyInactivityTimeout('never');
  assert.equal(harness.getState().blobKeyInactivityTimeoutMinutes, 'never');
  assert.equal(harness.getLocalSettings().blobKeyInactivityTimeoutMinutes, 'never');
  assert.equal(harness.saved.length, 1);
  assert.deepEqual(harness.log, ['render']);

  harness.controller.updateBlobKeyInactivityTimeout('never');
  assert.equal(harness.saved.length, 1, 'unchanged policy is a no-op');
});

test('updateRecentHistoryRetention reloads session history only when the limit grows in keep-session mode', async () => {
  const grow = createHarness();
  await grow.controller.updateRecentHistoryRetention({ limit: 50, retainedLimit: 75, overflowBehavior: 'keep-session' });
  assert.equal(grow.getState().recentHistoryLimit, 50);
  assert.equal(grow.getState().recentHistoryRetainedLimit, 75);
  assert.equal(grow.getLocalSettings().recentHistoryRetainedLimit, 75);
  assert.deepEqual(grow.log, ['loadRecentHistory'], 'growth in keep-session mode reloads instead of rendering');
  assert.equal(grow.saved.length, 1);

  const shrink = createHarness();
  await shrink.controller.updateRecentHistoryRetention({ limit: 10, retainedLimit: 10, overflowBehavior: 'drop-oldest' });
  assert.deepEqual(shrink.log, ['render']);
});

test('updateRecentHistoryRetention no-ops when unchanged or out of range', async () => {
  const unchanged = createHarness();
  await unchanged.controller.updateRecentHistoryRetention({ limit: 30, retainedLimit: 30, overflowBehavior: 'drop-oldest' });
  assert.deepEqual(unchanged.log, []);

  const outOfRange = createHarness();
  await outOfRange.controller.updateRecentHistoryRetention({ limit: 9_999, retainedLimit: 9_999, overflowBehavior: 'drop-oldest' });
  assert.deepEqual(outOfRange.log, []);
  assert.deepEqual(outOfRange.saved, []);
});

test('updateRecentHistoryRetention normalizes max kept recents to at least visible recents', async () => {
  const harness = createHarness();
  await harness.controller.updateRecentHistoryRetention({ limit: 40, retainedLimit: 10, overflowBehavior: 'keep-session' });

  assert.equal(harness.getState().recentHistoryLimit, 40);
  assert.equal(harness.getState().recentHistoryRetainedLimit, 40);
  assert.equal(harness.getLocalSettings().recentHistoryRetainedLimit, 40);
});

test('updateRecentSparseRowDisplayMode persists and renders only on a change', () => {
  const unchanged = createHarness();
  unchanged.controller.updateRecentSparseRowDisplayMode('adaptive');
  assert.deepEqual(unchanged.log, []);

  const changed = createHarness();
  changed.controller.updateRecentSparseRowDisplayMode('compact');
  assert.equal(changed.getState().recentSparseRowDisplayMode, 'compact');
  assert.equal(changed.getLocalSettings().recentSparseRowDisplayMode, 'compact');
  assert.deepEqual(changed.log, ['render']);
  assert.equal(changed.saved.length, 1);
});

test('updateDownArrowAction persists and renders only on a change', () => {
  const unchanged = createHarness();
  unchanged.controller.updateDownArrowAction('capture');
  assert.deepEqual(unchanged.log, []);

  const changed = createHarness();
  changed.controller.updateDownArrowAction('download');
  assert.equal(changed.getState().downArrowAction, 'download');
  assert.equal(changed.getLocalSettings().downArrowAction, 'download');
  assert.deepEqual(changed.log, ['render']);
  assert.equal(changed.saved.length, 1);
});

test('updatePinSaveStoragePreference persists and renders only on a change', () => {
  const unchanged = createHarness();
  unchanged.controller.updatePinSaveStoragePreference('encrypted');
  assert.deepEqual(unchanged.log, []);

  const changed = createHarness();
  changed.controller.updatePinSaveStoragePreference('plaintext');
  assert.equal(changed.getState().pinSaveStoragePreference, 'plaintext');
  assert.equal(changed.getLocalSettings().pinSaveStoragePreference, 'plaintext');
  assert.deepEqual(changed.log, ['render']);
});

test('updateUrlReviewStatusRetention clamps to its limits and persists a valid change', async () => {
  const outOfRange = createHarness();
  await outOfRange.controller.updateUrlReviewStatusRetention(5, false);
  assert.deepEqual(outOfRange.log, [], 'below the 10 minimum is rejected');

  const changed = createHarness();
  await changed.controller.updateUrlReviewStatusRetention(1_000, true);
  assert.equal(changed.getState().urlReviewStatusLimit, 1_000);
  assert.equal(changed.getState().clearUrlReviewStatusAfterExport, true);
  assert.deepEqual(changed.log, ['render']);
  assert.equal(changed.saved.length, 1);
});

test('updateRequestThrottle pushes the new config into the governor only on a change', () => {
  const unchanged = createHarness();
  const s = unchanged.getState();
  unchanged.controller.updateRequestThrottle(s.requestThrottleMs, s.requestThrottleMaxRequests, s.requestThrottleWindowMs);
  assert.deepEqual(unchanged.log, []);
  assert.deepEqual(unchanged.governorConfigs, []);

  const changed = createHarness();
  changed.controller.updateRequestThrottle(500, 12, 30_000);
  assert.deepEqual(changed.governorConfigs, [{ minimumIntervalMs: 500, maxRequests: 12, windowMs: 30_000 }]);
  assert.equal(changed.getState().requestThrottleMs, 500);
  assert.deepEqual(changed.log, ['render']);
});

test('updateRequestThrottle rejects any out-of-range component', () => {
  const harness = createHarness();
  harness.controller.updateRequestThrottle(500, 0, 30_000); // maxRequests below min
  harness.controller.updateRequestThrottle(500, 12, 500); // windowMs below its 1000 min
  assert.deepEqual(harness.governorConfigs, []);
  assert.deepEqual(harness.log, []);
});

test('updateNeighborPreload prunes without invalidating when enabling, and invalidates when disabling', () => {
  const enable = createHarness();
  enable.controller.updateNeighborPreload(true, 4, 24);
  assert.equal(enable.getState().neighborPreloadEnabled, true);
  assert.deepEqual(enable.log, ['pruneCache', 'render'], 'enabling prunes but must not invalidate');

  const disable = createHarness();
  disable.setState({ ...disable.getState(), neighborPreloadEnabled: true });
  disable.controller.updateNeighborPreload(false, 3, 24);
  assert.deepEqual(disable.log, ['invalidate', 'pruneCache', 'render']);
});

test('updateNeighborPreload no-ops when unchanged or with an out-of-range radius', () => {
  const unchanged = createHarness();
  unchanged.controller.updateNeighborPreload(false, 3, 24, 'get');
  assert.deepEqual(unchanged.log, []);

  const badRadius = createHarness();
  badRadius.controller.updateNeighborPreload(true, 9, 24);
  assert.deepEqual(badRadius.log, []);
  assert.deepEqual(badRadius.saved, []);
});

test('preloadMoreNeighbors reports the candidate count when neighbors are queued', () => {
  const harness = createHarness({ navFields: [{ id: 'p' } as UrlField], preloadMoreResult: { candidateCount: 7 } });
  harness.controller.preloadMoreNeighbors(4, 24);
  // First updateNeighborPreload runs (enabling from the default disabled state): pruneCache + render,
  // then preloadMore + the success render.
  assert.deepEqual(harness.log, ['pruneCache', 'render', 'preloadMore', 'render']);
  assert.match(harness.getState().message, /Preloading 7 more parsed-field neighbor image\(s\)/);
});

test('preloadMoreNeighbors reports when there are no additional candidates', () => {
  const harness = createHarness({ navFields: [{ id: 'p' } as UrlField], preloadMoreResult: null });
  harness.controller.preloadMoreNeighbors(4, 24);
  assert.deepEqual(harness.log, ['pruneCache', 'render', 'preloadMore', 'render']);
  assert.equal(harness.getState().message, 'No additional parsed-field preload candidates found.');
});

test('preloadMoreNeighbors bails out when the preload session is inactive', () => {
  const harness = createHarness({ isActive: false });
  harness.controller.preloadMoreNeighbors(4, 24);
  assert.ok(!harness.log.includes('preloadMore'), 'an inactive session must not query for more candidates');
});

test('preloadMoreNeighbors bails out when the base URL model cannot be parsed', () => {
  const harness = createHarness({
    navModel: () => {
      throw new Error('unparseable');
    },
  });
  harness.controller.preloadMoreNeighbors(4, 24);
  assert.ok(!harness.log.includes('preloadMore'));
});

test('preloadMoreNeighbors bails out when no navigable fields are included', () => {
  const harness = createHarness({ navFields: [] });
  harness.controller.preloadMoreNeighbors(4, 24);
  assert.ok(!harness.log.includes('preloadMore'));
});
