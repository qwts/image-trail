import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState, UrlTemplateStore } from '../extension/src/core/types.js';
import type { CaptureStore } from '../extension/src/content/capture-controller.js';
import type { StorageUsageSummary } from '../extension/src/core/image/capture-result.js';
import { PanelDataLoadController, type PanelDataLoadControllerDeps } from '../extension/src/ui/panel/panel-data-load-controller.js';

// Window-free paths only: URL-template loading and storage refresh never touch window; the
// bookmark/recent loaders short-circuit before window.location when their store is absent. Their
// store-backed paths (which read window.location.href) run in tests/dom/panel-data-load-controller.test.ts.
interface HarnessOptions {
  readonly urlTemplateStore?: UrlTemplateStore | null;
  readonly captureStore?: Partial<CaptureStore> | null;
  readonly hostname?: string | null;
}

interface Harness {
  readonly controller: PanelDataLoadController;
  readonly log: string[];
  getState(): PanelState;
}

function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const urlTemplateStore: UrlTemplateStore = {
    load: async () => [{ id: 't1', hostname: 'images.example.test', fields: [] }] as never,
    loadGrabSourcePatterns: async () => ['*.example.test'] as never,
  } as unknown as UrlTemplateStore;
  const captureStore = {
    requestStorageUsage: async (): Promise<StorageUsageSummary> => ({ blobCount: 2, totalBytes: 100 }),
    ...(options.captureStore ?? {}),
  } as unknown as CaptureStore;
  const deps: PanelDataLoadControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => log.push('render'),
    bookmarkStore: () => null,
    recentHistoryStore: () => null,
    captureStore: () => (options.captureStore === null ? null : captureStore),
    urlTemplateStore: () => (options.urlTemplateStore === undefined ? urlTemplateStore : options.urlTemplateStore),
    loadLocalSettings: async () => void log.push('loadLocalSettings'),
    currentUrlTemplateHostname: () => (options.hostname === undefined ? 'images.example.test' : options.hostname),
    activeTemplateIdForCurrentUrl: () => 't1',
    syncGrabSettings: () => log.push('syncGrabSettings'),
    primeBufferedNav: () => log.push('primeBufferedNav'),
  };
  return { controller: new PanelDataLoadController(deps), log, getState: () => state };
}

test('loadGrabSettings loads templates + grab patterns, syncs settings and primes buffered nav', async () => {
  const harness = createHarness();
  await harness.controller.loadGrabSettings();
  assert.equal(harness.getState().urlTemplates.length, 1);
  assert.deepEqual(harness.getState().grabSourcePatterns, ['*.example.test']);
  assert.ok(harness.log.includes('syncGrabSettings'));
  assert.ok(harness.log.includes('primeBufferedNav'));
  assert.ok(harness.log.includes('render'));
});

test('loadGrabSettings is a no-op without a url-template store', async () => {
  const harness = createHarness({ urlTemplateStore: null });
  await harness.controller.loadGrabSettings();
  assert.deepEqual(harness.log, []);
});

test('loadGrabSettings is a no-op when there is no template hostname', async () => {
  const harness = createHarness({ hostname: null });
  await harness.controller.loadGrabSettings();
  assert.deepEqual(harness.log, []);
});

test('loadGrabSettings honors render:false', async () => {
  const harness = createHarness();
  await harness.controller.loadGrabSettings({ render: false });
  assert.ok(!harness.log.includes('render'));
});

test('applyStorageUsage folds the usage summary into panel state', () => {
  const harness = createHarness();
  harness.controller.applyStorageUsage({ blobCount: 5, totalBytes: 999 });
  assert.deepEqual(harness.getState().storageUsage, { blobCount: 5, totalBytes: 999 });
});

test('refreshStorageUsage applies the usage when the request is still current', async () => {
  const harness = createHarness();
  await harness.controller.refreshStorageUsage();
  assert.deepEqual(harness.getState().storageUsage, { blobCount: 2, totalBytes: 100 });
});

test('refreshStorageUsage discards a stale response when a newer request superseded it', async () => {
  let resolveUsage: (usage: StorageUsageSummary) => void = () => {};
  const harness = createHarness({
    captureStore: {
      requestStorageUsage: () => new Promise<StorageUsageSummary>((resolve) => (resolveUsage = resolve)),
    },
  });
  const pending = harness.controller.refreshStorageUsage();
  // A concurrent invalidation (e.g. a blob delete) bumps the single-flight id before the response lands.
  harness.controller.invalidateStorageUsageRequests();
  resolveUsage({ blobCount: 9, totalBytes: 9 });
  await pending;
  assert.equal(harness.getState().storageUsage, null, 'the superseded response is ignored');
});

test('refreshStorageUsage is a no-op without a capture store', async () => {
  const harness = createHarness({ captureStore: null });
  await harness.controller.refreshStorageUsage();
  assert.equal(harness.getState().storageUsage, null);
});

test('loadBookmarkPage and loadRecentHistory short-circuit without their stores', async () => {
  const harness = createHarness();
  await harness.controller.loadBookmarkPage(0);
  await harness.controller.loadRecentHistory();
  assert.deepEqual(harness.log, []);
});
