import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { BookmarkStore, PanelState, UrlReviewStatusStore } from '../extension/src/core/types.js';
import type { CaptureStore } from '../extension/src/content/capture-controller.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/content/panel-services.js';
import { RecallExportController, type RecallExportControllerDeps } from '../extension/src/ui/panel/recall-export-controller.js';

const CONNECTED_STATUS = { connected: true, apiHost: 'api.pcloud.com' as const, connectedAt: '2026-01-01T00:00:00.000Z' };
const DISCONNECTED_STATUS = { connected: false };

interface ExportHarness {
  readonly controller: RecallExportController;
  getState(): PanelState;
}

// Window-free export paths only (blob-key + pCloud connect/disconnect + the pre-load password guard).
// The backup and export-download paths reach window.location / URL.createObjectURL and are covered by
// tests/dom/recall-export-controller.test.ts. Store fakes implement only the touched methods and are cast.
function createExportHarness(captureStore: Partial<Record<keyof CaptureStore, unknown>> | null = {}): ExportHarness {
  let state = createInitialPanelState(0);
  const deps: RecallExportControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {},
    renderPanelAndRefreshRecall: () => {},
    loadBookmarkPage: async () => {},
    getLocalSettings: () => DEFAULT_LOCAL_SETTINGS,
    findSelectedImage: () => null,
    bookmarkStore: () => null as BookmarkStore | null,
    albumStore: () => null,
    captureStore: () => (captureStore === null ? null : (captureStore as unknown as CaptureStore)),
    urlReviewStatusStore: () => null as UrlReviewStatusStore | null,
    loadPCloudProviderStatus: (async () => DISCONNECTED_STATUS) as RecallExportControllerDeps['loadPCloudProviderStatus'],
    connectPCloudProvider: (async () => ({ ok: true, status: CONNECTED_STATUS })) as RecallExportControllerDeps['connectPCloudProvider'],
    disconnectPCloudProvider: (async () => ({
      ok: true,
      status: DISCONNECTED_STATUS,
    })) as RecallExportControllerDeps['disconnectPCloudProvider'],
    uploadPCloudBackup: (async () => ({ ok: false, message: 'unused' })) as unknown as RecallExportControllerDeps['uploadPCloudBackup'],
  };
  return { controller: new RecallExportController(deps), getState: () => state };
}

test('setupBlobKey reflects a successful unlock into panel state', async () => {
  const harness = createExportHarness({
    setupBlobKey: async () => ({ ok: true, message: 'Encrypted originals unlocked.', keyReference: 'key-1' }),
  });

  await harness.controller.setupBlobKey('blob-pass');

  assert.equal(harness.getState().blobKeyUnlocked, true);
  assert.equal(harness.getState().blobKeyReference, 'key-1');
  assert.equal(harness.getState().status, 'ready');
});

test('refreshBlobKeyStatus mirrors the capture store status', async () => {
  const harness = createExportHarness({
    requestBlobKeyStatus: async () => ({ unlocked: true, keyReference: 'key-1', hasKey: true }),
  });

  await harness.controller.refreshBlobKeyStatus();

  assert.equal(harness.getState().blobKeyUnlocked, true);
  assert.equal(harness.getState().blobKeyAvailable, true);
});

test('clearBlobKey locks encrypted originals back down', async () => {
  const harness = createExportHarness({
    requestBlobKeyStatus: async () => ({ unlocked: true, keyReference: 'key-1', hasKey: true }),
    clearBlobKey: async () => ({ ok: true, message: 'Encrypted originals cleared.' }),
  });
  await harness.controller.refreshBlobKeyStatus();

  await harness.controller.clearBlobKey();

  assert.equal(harness.getState().blobKeyUnlocked, false);
  assert.equal(harness.getState().blobKeyAvailable, false);
});

test('backupPCloudNow rejects a short cloud password before touching storage', async () => {
  const harness = createExportHarness({});

  await harness.controller.backupPCloudNow('abc');

  assert.match(harness.getState().pcloudBackup.message ?? '', /at least 4 characters/u);
});

test('connectPCloudBackup marks the provider connected', async () => {
  const harness = createExportHarness({});

  await harness.controller.connectPCloudBackup();

  assert.equal(harness.getState().pcloudBackup.connectionState, 'connected');
});

test('disconnectPCloudBackup marks the provider disconnected', async () => {
  const harness = createExportHarness({});

  await harness.controller.disconnectPCloudBackup();

  assert.equal(harness.getState().pcloudBackup.connectionState, 'disconnected');
});

test('exportImage reports when nothing is selected to export', async () => {
  const harness = createExportHarness({});

  await harness.controller.exportImage(false);

  assert.match(harness.getState().message, /Select an image before exporting\./u);
});

test('exportEncryptedImages requires the blob key to be unlocked', async () => {
  const harness = createExportHarness({});

  await harness.controller.exportEncryptedImages();

  assert.match(harness.getState().message, /Unlock encrypted originals before exporting encrypted images\./u);
});
