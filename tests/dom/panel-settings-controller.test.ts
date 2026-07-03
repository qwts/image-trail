import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LOCAL_SETTINGS, type PlaintextLocalSettings } from '../../extension/src/content/panel-services.js';
import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelState } from '../../extension/src/core/types.js';
import { parseUrl } from '../../extension/src/core/url/parse-url.js';
import type { UrlField } from '../../extension/src/core/url/types.js';
import { PanelSettingsController, type PanelSettingsControllerDeps } from '../../extension/src/ui/panel/panel-settings-controller.js';

// The settings controller has no window/DOM code of its own, but every mutation ends in a `render`.
// This suite runs under happy-dom (tests/dom/register.ts preload) with the `render` dep wired to a
// real element so the settings flow is exercised as an integration: state changes must surface in the
// DOM the panel would rebuild.

interface Harness {
  readonly controller: PanelSettingsController;
  readonly status: HTMLElement;
  getState(): PanelState;
  getLocalSettings(): PlaintextLocalSettings;
}

function createHarness(
  options: { readonly storeSettings?: PlaintextLocalSettings; readonly navFields?: readonly UrlField[] } = {},
): Harness {
  let state = createInitialPanelState(0);
  let localSettings: PlaintextLocalSettings = { ...DEFAULT_LOCAL_SETTINGS };
  const status = document.createElement('div');
  document.body.append(status);
  const model = parseUrl('https://images.example.test/photo?p=5');
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
      // Stand in for the panel's real render: reflect the observable state into the DOM.
      status.textContent = state.message;
      status.dataset.bookmarkLimit = String(state.bookmarkLimit);
    },
    renderPanelAndRefreshRecall: () => {
      status.dataset.bookmarkLimit = String(state.bookmarkLimit);
    },
    loadBookmarkPage: async () => {},
    loadRecentHistory: async () => {},
    currentNavigationBaseModel: () => model,
    includedNavigationFields: () => options.navFields ?? [],
    localSettingsStore: () => ({
      load: async () => options.storeSettings ?? DEFAULT_LOCAL_SETTINGS,
      save: async () => {},
    }),
    governor: () => ({ updateConfig: () => {} }),
    neighborPreload: () => ({
      isActive: true,
      invalidate: () => {},
      pruneCache: () => {},
      preloadMore: () => ({ candidateCount: 5 }),
    }),
    pageAdapter: () => ({
      setPreviewPreferences: (preferences) => ({
        mode: 'none',
        picking: false,
        grabModeActive: false,
        candidateCount: 0,
        selected: null,
        fillScreen: preferences.fillScreen,
        objectFit: preferences.objectFit,
        message: '',
      }),
    }),
  };
  return {
    controller: new PanelSettingsController(deps),
    status,
    getState: () => state,
    getLocalSettings: () => localSettings,
  };
}

test('loadLocalSettings drives a render that reflects the new bookmark limit into the DOM', async () => {
  const harness = createHarness({ storeSettings: { ...DEFAULT_LOCAL_SETTINGS, visibleBookmarkSoftMax: 15 } });
  await harness.controller.loadLocalSettings();
  assert.equal(harness.status.dataset.bookmarkLimit, '15');
  assert.equal(harness.getState().bookmarkLimit, 15);
});

test('preloadMoreNeighbors renders the queued-candidate message into the DOM', () => {
  const harness = createHarness({ navFields: [{ id: 'p' } as UrlField] });
  harness.controller.preloadMoreNeighbors(4, 24);
  assert.match(harness.status.textContent ?? '', /Preloading 5 more parsed-field neighbor image\(s\)/);
});

test('updateVisibleBookmarkSoftMax refreshes the recall-adjacent bookmark limit in the DOM', async () => {
  const harness = createHarness();
  await harness.controller.updateVisibleBookmarkSoftMax(42);
  assert.equal(harness.status.dataset.bookmarkLimit, '42');
});
