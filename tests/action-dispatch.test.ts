import test from 'node:test';
import assert from 'node:assert/strict';

import type { KeyboardRouter } from '../extension/src/content/keyboard.js';
import type { PageAdapter, TargetSelectionSnapshot } from '../extension/src/content/page-adapter.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/content/panel-services.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import { reducePanelAction } from '../extension/src/core/actions.js';
import type { Retry404 } from '../extension/src/core/automation/retry-404.js';
import type { Slideshow } from '../extension/src/core/automation/slideshow.js';
import type { PanelAction, PanelState } from '../extension/src/core/types.js';
import { defineAction, dispatchPanelAction, type ActionDef, type PanelActionFor } from '../extension/src/ui/panel/action-dispatch.js';
import { buildAutomationActionEntries } from '../extension/src/ui/panel/actions/automation-actions.js';
import type { PanelActionDeps } from '../extension/src/ui/panel/actions/deps.js';
import { buildFieldActionEntries } from '../extension/src/ui/panel/actions/field-actions.js';
import { buildLibraryActionEntries } from '../extension/src/ui/panel/actions/library-actions.js';
import { buildPanelSettingsActionEntries } from '../extension/src/ui/panel/actions/panel-settings-actions.js';
import { buildRecallActionEntries } from '../extension/src/ui/panel/actions/recall-actions.js';
import { buildTargetActionEntries } from '../extension/src/ui/panel/actions/target-actions.js';
import { buildTransferActionEntries } from '../extension/src/ui/panel/actions/transfer-actions.js';
import { buildPanelActionRegistry, type RegisteredPanelActionName } from '../extension/src/ui/panel/actions/registry.js';
import type { PanelMount } from '../extension/src/ui/panel/panel-mount.js';
import type { ParsedFieldStateSync } from '../extension/src/ui/panel/parsed-field-state-sync.js';
import type { BufferedNavigationController } from '../extension/src/ui/panel/buffered-navigation-controller.js';
import type { RecallExportController } from '../extension/src/ui/panel/recall-export-controller.js';
import type { RecallRestoreController } from '../extension/src/ui/panel/recall-restore-controller.js';
import type { UrlTemplateSettingsController } from '../extension/src/ui/panel/url-template-settings-controller.js';

interface Harness {
  readonly deps: PanelActionDeps;
  readonly log: string[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

// Every deps member appends its name to `log` so tests can assert routing and side-effect order.
// `reduce` runs the REAL reducer over a state box so guard branches (secondary-controls no-op,
// recall/open toggle, recall/load-more gating) behave as they do in the panel. Collaborator stubs
// implement only the methods the handlers touch and are cast, matching the controller-test style.
function createHarness(
  options: {
    readonly applyPanelStateResult?: boolean;
    readonly slideshowPhase?: Slideshow['currentPhase'];
    readonly slideshowDirection?: 1 | -1;
  } = {},
): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const record = (name: string) => {
    log.push(name);
  };
  const recordAsync = (name: string) => {
    log.push(name);
    return Promise.resolve();
  };
  const snapshot = { fillScreen: true, objectFit: 'cover' } as TargetSelectionSnapshot;
  const pageAdapter = {
    startPickMode: () => {
      record('pageAdapter.startPickMode');
      return snapshot;
    },
    stopPickMode: () => {
      record('pageAdapter.stopPickMode');
      return snapshot;
    },
    startGrabMode: () => {
      record('pageAdapter.startGrabMode');
      return snapshot;
    },
    stopGrabMode: () => {
      record('pageAdapter.stopGrabMode');
      return snapshot;
    },
    releaseSelectedTarget: () => {
      record('pageAdapter.releaseSelectedTarget');
      return snapshot;
    },
    setSelectedFillScreen: () => {
      record('pageAdapter.setSelectedFillScreen');
      return snapshot;
    },
    setSelectedObjectFit: () => {
      record('pageAdapter.setSelectedObjectFit');
      return snapshot;
    },
    enableBookmarkShortcut: () => record('pageAdapter.enableBookmarkShortcut'),
  } as unknown as PageAdapter;
  const urlTemplateSettings = {
    removeUrlTemplate: () => recordAsync('urlTemplateSettings.removeUrlTemplate'),
    updateUrlTemplateSettings: () => recordAsync('urlTemplateSettings.updateUrlTemplateSettings'),
    updateUrlTemplateFields: () => recordAsync('urlTemplateSettings.updateUrlTemplateFields'),
    updateGrabSourcePattern: () => recordAsync('urlTemplateSettings.updateGrabSourcePattern'),
    removeGrabSourcePattern: () => recordAsync('urlTemplateSettings.removeGrabSourcePattern'),
    saveUrlTemplateFromCurrentFields: () => recordAsync('urlTemplateSettings.saveUrlTemplateFromCurrentFields'),
  } as unknown as UrlTemplateSettingsController;
  const recallExport = {
    setupBlobKey: () => recordAsync('recallExport.setupBlobKey'),
    unlockBlobKey: () => recordAsync('recallExport.unlockBlobKey'),
    clearBlobKey: () => recordAsync('recallExport.clearBlobKey'),
    exportBlobKeyBackup: () => recordAsync('recallExport.exportBlobKeyBackup'),
    importBlobKeyBackup: () => recordAsync('recallExport.importBlobKeyBackup'),
    connectPCloudBackup: () => recordAsync('recallExport.connectPCloudBackup'),
    disconnectPCloudBackup: () => recordAsync('recallExport.disconnectPCloudBackup'),
    backupPCloudNow: () => recordAsync('recallExport.backupPCloudNow'),
    exportHistory: () => recordAsync('recallExport.exportHistory'),
    exportBookmarks: () => recordAsync('recallExport.exportBookmarks'),
    exportImage: () => recordAsync('recallExport.exportImage'),
    exportEncryptedImages: () => recordAsync('recallExport.exportEncryptedImages'),
    exportUrlReviewStatus: () => recordAsync('recallExport.exportUrlReviewStatus'),
  } as unknown as RecallExportController;
  const recallRestore = {
    choosePCloudRestoreFile: () => recordAsync('recallRestore.choosePCloudRestoreFile'),
    previewPCloudRestoreFile: () => recordAsync('recallRestore.previewPCloudRestoreFile'),
    previewHistoryImport: () => recordAsync('recallRestore.previewHistoryImport'),
    previewBookmarksImport: () => recordAsync('recallRestore.previewBookmarksImport'),
    previewUrlReviewStatusImport: () => record('recallRestore.previewUrlReviewStatusImport'),
    confirmRestorePreview: () => recordAsync('recallRestore.confirmRestorePreview'),
    cancelRestorePreview: () => record('recallRestore.cancelRestorePreview'),
    importImages: () => recordAsync('recallRestore.importImages'),
    importEncryptedImages: () => recordAsync('recallRestore.importEncryptedImages'),
  } as unknown as RecallRestoreController;
  const deps: PanelActionDeps = {
    getState: () => state,
    reduce: (action) => {
      record('reduce');
      state = reducePanelAction(state, action);
    },
    applyPanelState: (nextState) => {
      record('applyPanelState');
      if (options.applyPanelStateResult !== true) return false;
      state = nextState;
      return true;
    },
    syncTargetState: () => record('syncTargetState'),
    render: () => record('render'),
    renderPanelAndRefreshRecall: () => record('renderPanelAndRefreshRecall'),
    refreshRecallIfOpen: () => record('refreshRecallIfOpen'),
    clearRecallMessageTimer: () => record('clearRecallMessageTimer'),
    getLocalSettings: () => DEFAULT_LOCAL_SETTINGS,
    saveLocalSettings: () => record('saveLocalSettings'),
    applyBuildInfoOverlayVisibility: () => record('applyBuildInfoOverlayVisibility'),
    pageAdapter: () => pageAdapter,
    panelMount: () => ({ mount: () => record('panelMount.mount') }) as unknown as PanelMount,
    keyboard: () => ({ enable: () => record('keyboard.enable') }) as unknown as KeyboardRouter,
    slideshow: () =>
      ({
        get currentPhase() {
          return options.slideshowPhase ?? 'idle';
        },
        get currentDirection() {
          return options.slideshowDirection ?? 1;
        },
        start: () => record('slideshow.start'),
        stop: () => record('slideshow.stop'),
        pause: () => record('slideshow.pause'),
        resume: () => record('slideshow.resume'),
      }) as unknown as Slideshow,
    retry: () =>
      ({
        start: () => record('retry.start'),
        stop: () => record('retry.stop'),
      }) as unknown as Retry404,
    fieldStateSync: () => ({ save: () => recordAsync('fieldStateSync.save') }) as unknown as ParsedFieldStateSync,
    bufferedNav: () => ({ prime: () => record('bufferedNav.prime') }) as unknown as BufferedNavigationController,
    urlTemplateSettings: () => urlTemplateSettings,
    recallExport: () => recallExport,
    recallRestore: () => recallRestore,
    bookmarkCurrentImage: () => recordAsync('bookmarkCurrentImage'),
    removeRecentHistory: () => recordAsync('removeRecentHistory'),
    deleteRecentHistory: () => recordAsync('deleteRecentHistory'),
    pinRecentHistory: () => recordAsync('pinRecentHistory'),
    loadBookmark: () => recordAsync('loadBookmark'),
    removeBookmark: () => recordAsync('removeBookmark'),
    loadBookmarkPage: (offset) => recordAsync(`loadBookmarkPage:${offset}`),
    refreshBookmarkThumbnails: () => recordAsync('refreshBookmarkThumbnails'),
    deleteVisibleBookmarks: () => recordAsync('deleteVisibleBookmarks'),
    deleteRecallBookmarks: () => recordAsync('deleteRecallBookmarks'),
    updateVisibleBookmarkSoftMax: () => recordAsync('updateVisibleBookmarkSoftMax'),
    updateRecentHistoryRetention: () => recordAsync('updateRecentHistoryRetention'),
    updatePinSaveStoragePreference: () => record('updatePinSaveStoragePreference'),
    updateUrlReviewStatusRetention: () => recordAsync('updateUrlReviewStatusRetention'),
    updateRequestThrottle: () => record('updateRequestThrottle'),
    updateNeighborPreload: () => record('updateNeighborPreload'),
    preloadMoreNeighbors: () => record('preloadMoreNeighbors'),
    resetPanelPosition: () => recordAsync('resetPanelPosition'),
    refreshStorageUsage: () => recordAsync('refreshStorageUsage'),
    restoreParsedFieldStateForCurrentPanel: () => record('restoreParsedFieldStateForCurrentPanel'),
    openRecallDrawer: () => recordAsync('openRecallDrawer'),
    loadRecallCandidates: (input) => recordAsync(`loadRecallCandidates:${input.offset}:${String(input.append)}`),
    recallSelectedRecords: () => recordAsync('recallSelectedRecords'),
    enqueueFieldTransform: () => record('enqueueFieldTransform'),
    enqueueSelectedUrlApply: () => record('enqueueSelectedUrlApply'),
    rejectUrlEditorInput: () => record('rejectUrlEditorInput'),
    captureImage: () => recordAsync('captureImage'),
    deleteCapturedBlob: () => recordAsync('deleteCapturedBlob'),
    cleanupOrphanedBlobs: () => recordAsync('cleanupOrphanedBlobs'),
    previewRecord: () => recordAsync('previewRecord'),
    clearUrlReviewStatus: (scope) => recordAsync(`clearUrlReviewStatus:${scope}`),
    navigateBy: (delta) => record(`navigateBy:${delta}`),
    cancelQueuedSlideshowNavigation: () => record('cancelQueuedSlideshowNavigation'),
  };
  return {
    deps,
    log,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

// One valid action per registered name. The mapped type makes this a second compile-time totality
// check: adding a registry entry without a fixture (or vice versa) fails to build.
const fixtures: { readonly [N in RegisteredPanelActionName]: PanelActionFor<N> } = {
  'start-target-picker': { name: 'start-target-picker' },
  'stop-target-picker': { name: 'stop-target-picker' },
  'grab-mode/start': { name: 'grab-mode/start' },
  'grab-mode/stop': { name: 'grab-mode/stop' },
  'target/release': { name: 'target/release' },
  'target/fill-screen': { name: 'target/fill-screen', enabled: true },
  'target/set-object-fit': { name: 'target/set-object-fit', mode: 'contain' },
  'panel/secondary-controls-open': { name: 'panel/secondary-controls-open', open: true },
  'panel/minimize': { name: 'panel/minimize' },
  'panel/expand': { name: 'panel/expand' },
  'settings/toggle': { name: 'settings/toggle' },
  'settings/update-visible-bookmark-soft-max': { name: 'settings/update-visible-bookmark-soft-max', value: 10 },
  'settings/update-recent-history-retention': {
    name: 'settings/update-recent-history-retention',
    limit: 20,
    overflowBehavior: 'drop-oldest',
  },
  'settings/update-pin-save-storage-preference': { name: 'settings/update-pin-save-storage-preference', value: 'encrypted' },
  'settings/update-privacy-mode': { name: 'settings/update-privacy-mode', enabled: true },
  'settings/update-build-info-overlay-visibility': { name: 'settings/update-build-info-overlay-visibility', visible: false },
  'settings/update-url-review-status-retention': {
    name: 'settings/update-url-review-status-retention',
    limit: 100,
    clearAfterExport: false,
  },
  'settings/update-request-throttle': {
    name: 'settings/update-request-throttle',
    minimumIntervalMs: 100,
    maxRequests: 5,
    windowMs: 1000,
  },
  'settings/update-neighbor-preload': {
    name: 'settings/update-neighbor-preload',
    enabled: true,
    radius: 2,
    cacheLimit: 10,
    probeMethod: 'get',
  },
  'neighbor-preload/manual': { name: 'neighbor-preload/manual', radius: 2, cacheLimit: 10 },
  'settings/reset-panel-position': { name: 'settings/reset-panel-position' },
  'pin/current': { name: 'pin/current' },
  'bookmark/current': { name: 'bookmark/current' },
  'history/remove': { name: 'history/remove', id: 'history-1' },
  'history/delete-all': { name: 'history/delete-all' },
  'history/pin': { name: 'history/pin', id: 'history-1' },
  'bookmark/load': { name: 'bookmark/load', id: 'bookmark-1' },
  'bookmark/remove': { name: 'bookmark/remove', id: 'bookmark-1' },
  'bookmark/clear': { name: 'bookmark/clear', id: 'bookmark-1' },
  'bookmarks/clear-visible': { name: 'bookmarks/clear-visible' },
  'bookmarks/older': { name: 'bookmarks/older' },
  'bookmarks/newer': { name: 'bookmarks/newer' },
  'bookmarks/toggle-scope': { name: 'bookmarks/toggle-scope' },
  'bookmarks/reload': { name: 'bookmarks/reload' },
  'bookmarks/refresh-thumbnails': { name: 'bookmarks/refresh-thumbnails' },
  'bookmarks/delete-visible': { name: 'bookmarks/delete-visible' },
  'selection/select-visible': { name: 'selection/select-visible' },
  'history-selection/toggle': { name: 'history-selection/toggle', id: 'history-1' },
  'history-selection/select': { name: 'history-selection/select', ids: ['history-1'] },
  'history-selection/clear': { name: 'history-selection/clear' },
  'bookmark-selection/toggle': { name: 'bookmark-selection/toggle', id: 'bookmark-1' },
  'bookmark-selection/single': { name: 'bookmark-selection/single', id: 'bookmark-1' },
  'bookmark-selection/select': { name: 'bookmark-selection/select', ids: ['bookmark-1'] },
  'bookmark-selection/clear': { name: 'bookmark-selection/clear' },
  'recall/delete-all': { name: 'recall/delete-all' },
  'recall/open': { name: 'recall/open', side: 'left' },
  'recall/close': { name: 'recall/close' },
  'recall-selection/toggle': { name: 'recall-selection/toggle', id: 'recall-1' },
  'recall-selection/select': { name: 'recall-selection/select', ids: ['recall-1'] },
  'recall-selection/clear': { name: 'recall-selection/clear' },
  'recall/clear-results': { name: 'recall/clear-results' },
  'recall/load-more': { name: 'recall/load-more' },
  'recall/selected': { name: 'recall/selected' },
  'field/transform': { name: 'field/transform', fieldId: 'field-1', transformId: 'set-value', value: '2' },
  'active-field/set': { name: 'active-field/set', id: null },
  'field-unlock/toggle': { name: 'field-unlock/toggle', id: 'field-1' },
  'selected-url/apply': { name: 'selected-url/apply', url: 'https://example.com/image-2.jpg' },
  'selected-url/reject-unsupported-input': { name: 'selected-url/reject-unsupported-input' },
  'url-template/remove': { name: 'url-template/remove', id: 'template-1' },
  'url-template/update-settings': { name: 'url-template/update-settings', id: 'template-1' },
  'url-template/update-fields': { name: 'url-template/update-fields', id: 'template-1', includedFieldIds: ['field-1'] },
  'grab-source-pattern/update-settings': { name: 'grab-source-pattern/update-settings', id: 'pattern-1' },
  'grab-source-pattern/remove': { name: 'grab-source-pattern/remove', id: 'pattern-1' },
  'capture/request': { name: 'capture/request', url: 'https://example.com/image-1.jpg', sourceType: 'target' },
  'capture/delete': { name: 'capture/delete', id: 'record-1', blobId: 'blob-1' },
  'capture/cleanup-orphans': { name: 'capture/cleanup-orphans' },
  'capture/preview': { name: 'capture/preview', url: 'https://example.com/image-1.jpg' },
  'blob-key/setup': { name: 'blob-key/setup', password: 'passphrase' },
  'blob-key/unlock': { name: 'blob-key/unlock', password: 'passphrase' },
  'blob-key/clear': { name: 'blob-key/clear' },
  'blob-key/export': { name: 'blob-key/export', password: 'passphrase' },
  'blob-key/import': { name: 'blob-key/import', fileContent: '{}', password: 'passphrase' },
  'cloud-backup/connect': { name: 'cloud-backup/connect', provider: 'pcloud' },
  'cloud-backup/retry': { name: 'cloud-backup/retry', provider: 'pcloud' },
  'cloud-backup/disconnect': { name: 'cloud-backup/disconnect', provider: 'pcloud' },
  'cloud-backup/backup-now': { name: 'cloud-backup/backup-now', provider: 'pcloud', password: 'passphrase' },
  'cloud-backup/choose-restore': { name: 'cloud-backup/choose-restore', provider: 'pcloud' },
  'cloud-backup/preview-restore': {
    name: 'cloud-backup/preview-restore',
    provider: 'pcloud',
    fileId: 1,
    fileName: 'backup.json',
    password: 'passphrase',
  },
  'export/history': { name: 'export/history', password: 'passphrase', plaintext: false },
  'export/bookmarks': { name: 'export/bookmarks', password: 'passphrase', plaintext: false },
  'export/image': { name: 'export/image', saveAs: true },
  'export/encrypted-image': { name: 'export/encrypted-image' },
  'export/url-review-status': { name: 'export/url-review-status' },
  'clear/url-review-status': { name: 'clear/url-review-status' },
  'import/history': { name: 'import/history', fileContent: '{}', password: 'passphrase' },
  'import/bookmarks': { name: 'import/bookmarks', fileContent: '{}', password: 'passphrase' },
  'import/url-review-status': { name: 'import/url-review-status', fileContent: '{}' },
  'import/confirm-restore-preview': { name: 'import/confirm-restore-preview' },
  'import/cancel-restore-preview': { name: 'import/cancel-restore-preview' },
  'import/image': { name: 'import/image', files: [] },
  'import/encrypted-image': { name: 'import/encrypted-image', files: [] },
  'slideshow-start': { name: 'slideshow-start' },
  'slideshow-stop': { name: 'slideshow-stop' },
  'slideshow-pause': { name: 'slideshow-pause' },
  'slideshow-resume': { name: 'slideshow-resume' },
  'retry-start': { name: 'retry-start' },
  'retry-stop': { name: 'retry-stop' },
  'stop-all': { name: 'stop-all' },
  'navigate-next': { name: 'navigate-next' },
  'navigate-previous': { name: 'navigate-previous' },
};

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('dispatchPanelAction routes a registered action to its handler and skips the fallback', () => {
  const handled: PanelAction[] = [];
  const entry: ActionDef<PanelActionFor<'navigate-next'>> = defineAction({
    handle(action) {
      handled.push(action);
    },
  });
  let fallbackCount = 0;
  dispatchPanelAction({ 'navigate-next': entry }, { name: 'navigate-next' }, () => {
    fallbackCount += 1;
  });
  assert.deepEqual(handled, [{ name: 'navigate-next' }]);
  assert.equal(fallbackCount, 0);
});

test('dispatchPanelAction hands unregistered actions to the fallback exactly once', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  const fallbackActions: PanelAction[] = [];
  const action: PanelAction = { name: 'toggle-panel' };
  dispatchPanelAction(registry, action, (unhandled) => {
    fallbackActions.push(unhandled);
  });
  assert.deepEqual(fallbackActions, [action]);
  assert.deepEqual(harness.log, [], 'no registry handler may run for a fallback action');
});

test('every registered action routes to a handler, never the fallback', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  const fallbackNames: string[] = [];
  for (const action of Object.values(fixtures)) {
    dispatchPanelAction(registry, action, (unhandled) => {
      fallbackNames.push(unhandled.name);
    });
  }
  assert.deepEqual(fallbackNames, []);
});

test('registry keys match the fixture domain with one entry per name and no tail names', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  const keys = Object.keys(registry);
  assert.equal(keys.length, Object.keys(fixtures).length);
  // Spreading group maps would silently drop duplicates across groups; the per-group sum catches that.
  const groupKeySum = [
    buildTargetActionEntries,
    buildPanelSettingsActionEntries,
    buildLibraryActionEntries,
    buildRecallActionEntries,
    buildFieldActionEntries,
    buildTransferActionEntries,
    buildAutomationActionEntries,
  ].reduce((sum, build) => sum + Object.keys(build(harness.deps)).length, 0);
  assert.equal(groupKeySum, keys.length);
  assert.ok(!keys.includes('toggle-panel'), 'toggle-panel must stay on the fallback tail');
  assert.ok(!keys.includes('close-panel'), 'close-panel must stay on the fallback tail');
});

test('reducer-only selection actions reduce then render, without touching the recall pipeline', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  dispatchPanelAction(registry, { name: 'history-selection/clear' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['reduce', 'render']);
});

test('adapter-delegating picker actions reduce then call the adapter, without rendering', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  dispatchPanelAction(registry, { name: 'start-target-picker' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['reduce', 'pageAdapter.startPickMode']);
});

test('bookmark/clear uses the renderPanelAndRefreshRecall variant, not a plain render', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  dispatchPanelAction(registry, { name: 'bookmark/clear', id: 'bookmark-1' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['reduce', 'renderPanelAndRefreshRecall']);
});

test('panel/secondary-controls-open is a silent no-op when the state already matches', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  const current = harness.getState().secondaryControlsOpen;
  dispatchPanelAction(registry, { name: 'panel/secondary-controls-open', open: current }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, []);
  dispatchPanelAction(registry, { name: 'panel/secondary-controls-open', open: !current }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['reduce', 'saveLocalSettings', 'render']);
  assert.equal(harness.getState().secondaryControlsOpen, !current);
});

test('build info overlay visibility setting persists and applies the overlay', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  dispatchPanelAction(registry, { name: 'settings/update-build-info-overlay-visibility', visible: false }, () =>
    assert.fail('unexpected fallback'),
  );
  assert.deepEqual(harness.log, ['reduce', 'saveLocalSettings', 'applyBuildInfoOverlayVisibility', 'render']);
  assert.equal(harness.getState().buildInfoOverlayVisible, false);
});

test('recall/open toggles an already-open drawer shut instead of reopening it', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  harness.patchState({ recall: { ...harness.getState().recall, open: true } });
  dispatchPanelAction(registry, { name: 'recall/open', side: 'left' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['clearRecallMessageTimer', 'reduce', 'render']);
  assert.equal(harness.getState().recall.open, false, 'the synthesized recall/close must reduce the drawer shut');
  harness.log.length = 0;
  dispatchPanelAction(registry, { name: 'recall/open', side: 'left' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['openRecallDrawer']);
});

test('recall/load-more only pages when the drawer is idle and has more candidates', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  harness.patchState({ recall: { ...harness.getState().recall, busy: false, hasMore: true, nextOffset: 7 } });
  dispatchPanelAction(registry, { name: 'recall/load-more' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['loadRecallCandidates:7:true']);
  harness.log.length = 0;
  harness.patchState({ recall: { ...harness.getState().recall, busy: true } });
  dispatchPanelAction(registry, { name: 'recall/load-more' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, [], 'a busy drawer must be a silent no-op');
});

test('stop-all halts the collaborators before reducing, unlike slideshow-start', () => {
  const harness = createHarness();
  const registry = buildPanelActionRegistry(harness.deps);
  dispatchPanelAction(registry, { name: 'stop-all' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['slideshow.stop', 'retry.stop', 'reduce', 'render']);
  harness.log.length = 0;
  dispatchPanelAction(registry, { name: 'slideshow-start' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['reduce', 'slideshow.start', 'render']);
});

test('opposite manual navigation cancels queued slideshow navigation before enqueueing the manual step', () => {
  const harness = createHarness({ slideshowPhase: 'running', slideshowDirection: 1 });
  const registry = buildPanelActionRegistry(harness.deps);
  dispatchPanelAction(registry, { name: 'navigate-previous' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['cancelQueuedSlideshowNavigation', 'slideshow.stop', 'navigateBy:-1']);
});

test('same-direction manual navigation leaves the running slideshow queue intact', () => {
  const harness = createHarness({ slideshowPhase: 'running', slideshowDirection: 1 });
  const registry = buildPanelActionRegistry(harness.deps);
  dispatchPanelAction(registry, { name: 'navigate-next' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['navigateBy:1']);
});

test('field-unlock/toggle stops after a rejected state application', () => {
  const harness = createHarness({ applyPanelStateResult: false });
  const registry = buildPanelActionRegistry(harness.deps);
  dispatchPanelAction(registry, { name: 'field-unlock/toggle', id: 'field-1' }, () => assert.fail('unexpected fallback'));
  assert.deepEqual(harness.log, ['applyPanelState']);
});

test('field-unlock/toggle saves the template, then primes navigation before rendering', async () => {
  const harness = createHarness({ applyPanelStateResult: true });
  const registry = buildPanelActionRegistry(harness.deps);
  dispatchPanelAction(registry, { name: 'field-unlock/toggle', id: 'field-1' }, () => assert.fail('unexpected fallback'));
  await flushMicrotasks();
  assert.deepEqual(harness.log, ['applyPanelState', 'urlTemplateSettings.saveUrlTemplateFromCurrentFields', 'bufferedNav.prime', 'render']);
});
