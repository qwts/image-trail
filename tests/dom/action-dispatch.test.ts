import test from 'node:test';
import assert from 'node:assert/strict';

import type { KeyboardRouter } from '../../extension/src/content/keyboard.js';
import type { PageAdapter } from '../../extension/src/content/page-adapter.js';
import { DEFAULT_LOCAL_SETTINGS } from '../../extension/src/content/panel-services.js';
import { createInitialPanelState } from '../../extension/src/core/state.js';
import { reducePanelAction } from '../../extension/src/core/actions.js';
import type { Retry404 } from '../../extension/src/core/automation/retry-404.js';
import type { Slideshow } from '../../extension/src/core/automation/slideshow.js';
import type { PanelState } from '../../extension/src/core/types.js';
import { dispatchPanelAction } from '../../extension/src/ui/panel/action-dispatch.js';
import type { PanelActionDeps } from '../../extension/src/ui/panel/actions/deps.js';
import { buildPanelActionRegistry } from '../../extension/src/ui/panel/actions/registry.js';
import { PanelMount, type PanelMountEnvironment } from '../../extension/src/ui/panel/panel-mount.js';
import type { ParsedFieldStateSync } from '../../extension/src/ui/panel/parsed-field-state-sync.js';
import type { BufferedNavigationController } from '../../extension/src/ui/panel/buffered-navigation-controller.js';
import type { RecallExportController } from '../../extension/src/ui/panel/recall-export-controller.js';
import type { RecallRestoreController } from '../../extension/src/ui/panel/recall-restore-controller.js';
import type { UrlTemplateSettingsController } from '../../extension/src/ui/panel/url-template-settings-controller.js';

const ROOT_ID = 'image-trail-panel-root';

interface Harness {
  readonly deps: PanelActionDeps;
  readonly log: string[];
  readonly panelMount: PanelMount;
}

// This suite runs under happy-dom (tests/dom/register.ts preload) so panel/minimize and
// panel/expand dispatch against a REAL PanelMount and toggle actual panel roots in the document.
// Everything else on the deps object is a recording fake; members irrelevant to the mount flow are
// inert stubs that only exist to satisfy the interface.
function createHarness(): Harness {
  let state: PanelState = createInitialPanelState(0);
  const log: string[] = [];
  const record = (name: string) => {
    log.push(name);
  };
  const recordAsync = (name: string) => {
    log.push(name);
    return Promise.resolve();
  };
  const noop = () => {};
  const noopAsync = () => Promise.resolve();
  const environment: PanelMountEnvironment = {
    document,
    resolveStyleUrl: (path) => `data:text/css,/* ${path} */`,
    scheduleStylesReadyFallback: () => {},
  };
  const panelMount = new PanelMount(
    {
      isPanelVisible: () => state.visible,
      isPanelMinimized: () => state.minimized,
      onStylesReady: () => {},
    },
    environment,
  );
  const deps: PanelActionDeps = {
    getState: () => state,
    reduce: (action) => {
      record('reduce');
      state = reducePanelAction(state, action);
    },
    applyPanelState: () => false,
    syncTargetState: noop,
    render: () => record('render'),
    renderPanelAndRefreshRecall: noop,
    refreshRecallIfOpen: noop,
    clearRecallMessageTimer: noop,
    getLocalSettings: () => DEFAULT_LOCAL_SETTINGS,
    saveLocalSettings: noop,
    applyBuildInfoOverlayVisibility: noop,
    pageAdapter: () => ({ enableBookmarkShortcut: () => record('pageAdapter.enableBookmarkShortcut') }) as unknown as PageAdapter,
    panelMount: () => panelMount,
    keyboard: () => ({ enable: () => record('keyboard.enable') }) as unknown as KeyboardRouter,
    slideshow: () => ({}) as unknown as Slideshow,
    retry: () => ({}) as unknown as Retry404,
    fieldStateSync: () => ({ save: () => recordAsync('fieldStateSync.save') }) as unknown as ParsedFieldStateSync,
    bufferedNav: () => ({}) as unknown as BufferedNavigationController,
    urlTemplateSettings: () => ({}) as unknown as UrlTemplateSettingsController,
    recallExport: () => ({}) as unknown as RecallExportController,
    recallRestore: () => ({}) as unknown as RecallRestoreController,
    bookmarkCurrentImage: noopAsync,
    removeRecentHistory: noopAsync,
    deleteRecentHistory: noopAsync,
    pinRecentHistory: noopAsync,
    loadBookmark: noopAsync,
    removeBookmark: noopAsync,
    loadBookmarkPage: noopAsync,
    refreshBookmarkThumbnails: noopAsync,
    deleteVisibleBookmarks: noopAsync,
    deleteRecallBookmarks: noopAsync,
    updateVisibleBookmarkSoftMax: noopAsync,
    updateRecentHistoryRetention: noopAsync,
    updatePinSaveStoragePreference: noop,
    updateUrlReviewStatusRetention: noopAsync,
    updateRequestThrottle: noop,
    updateNeighborPreload: noop,
    preloadMoreNeighbors: noop,
    resetPanelPosition: noopAsync,
    refreshStorageUsage: noopAsync,
    restoreParsedFieldStateForCurrentPanel: () => record('restoreParsedFieldStateForCurrentPanel'),
    openRecallDrawer: noopAsync,
    loadRecallCandidates: noopAsync,
    recallSelectedRecords: noopAsync,
    enqueueFieldTransform: noop,
    enqueueSelectedUrlApply: noop,
    rejectUrlEditorInput: noop,
    captureImage: noopAsync,
    deleteCapturedBlob: noopAsync,
    cleanupOrphanedBlobs: noopAsync,
    previewRecord: noopAsync,
    clearUrlReviewStatus: noopAsync,
    navigateBy: noop,
    cancelQueuedSlideshowNavigation: noop,
  };
  return { deps, log, panelMount };
}

test('panel/expand mounts the panel root and restores field state last', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  try {
    dispatchPanelAction(registry, { name: 'panel/expand' }, () => assert.fail('unexpected fallback'));
    assert.ok(document.getElementById(ROOT_ID), 'expected the panel host to be mounted');
    assert.deepEqual(harness.log, [
      'reduce',
      'keyboard.enable',
      'pageAdapter.enableBookmarkShortcut',
      'render',
      'restoreParsedFieldStateForCurrentPanel',
    ]);
  } finally {
    document.body.innerHTML = '';
  }
});

test('panel/minimize saves field state before remounting and skips the expand-only restore', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  try {
    dispatchPanelAction(registry, { name: 'panel/minimize' }, () => assert.fail('unexpected fallback'));
    assert.ok(document.getElementById(ROOT_ID), 'expected the panel host to stay mounted while minimized');
    assert.deepEqual(harness.log, ['fieldStateSync.save', 'reduce', 'keyboard.enable', 'pageAdapter.enableBookmarkShortcut', 'render']);
  } finally {
    document.body.innerHTML = '';
  }
});

test('close-panel stays unregistered and the fallback tears the mounted roots down', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  try {
    dispatchPanelAction(registry, { name: 'panel/expand' }, () => assert.fail('unexpected fallback'));
    assert.ok(document.getElementById(ROOT_ID));
    // Mirrors the teardown branch of ImageTrailPanel.handleDefaultAction: unregistered actions
    // reduce first, then tear the mounted elements down once the panel is no longer visible.
    let fallbackRuns = 0;
    dispatchPanelAction(registry, { name: 'close-panel' }, (action) => {
      fallbackRuns += 1;
      harness.deps.reduce(action);
      if (!harness.deps.getState().visible) harness.panelMount.teardown();
    });
    assert.equal(fallbackRuns, 1);
    assert.equal(document.getElementById(ROOT_ID), null, 'expected the fallback teardown to remove the panel host');
  } finally {
    document.body.innerHTML = '';
  }
});
