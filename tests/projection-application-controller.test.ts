import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import { ProjectionSessionController } from '../extension/src/core/projection-session.js';
import type { PanelState } from '../extension/src/core/types.js';
import type { CaptureStore } from '../extension/src/content/capture-controller.js';
import type { TargetSelectionSnapshot } from '../extension/src/content/page-adapter.js';
import {
  ProjectionApplicationController,
  type ProjectionApplicationControllerDeps,
} from '../extension/src/ui/panel/projection-application-controller.js';

interface Harness {
  readonly controller: ProjectionApplicationController;
  readonly log: string[];
  readonly projections: ProjectionSessionController;
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

type PreloadResult = Awaited<ReturnType<ReturnType<ProjectionApplicationControllerDeps['neighborPreload']>['preload']>>;

interface HarnessOptions {
  readonly selectedHandleId?: string | null;
  readonly selectedUrl?: string | null;
  readonly baselineFingerprint?: string | null;
  readonly preloadResults?: readonly PreloadResult[];
  readonly onPreload?: (harness: () => Harness) => void;
  readonly guardBlocked?: boolean;
  readonly captureStore?: CaptureStore | null;
  readonly hasSelectedImage?: boolean;
  readonly onApplyUrlToSelected?: (harness: () => Harness) => void;
}

function makeSnapshot(selected: { readonly url: string; readonly handleId: string } | null): TargetSelectionSnapshot {
  return {
    mode: selected ? 'manual' : 'none',
    picking: false,
    grabModeActive: false,
    candidateCount: selected ? 1 : 0,
    selected: selected
      ? ({ url: selected.url, handleId: selected.handleId, width: 100, height: 80 } as TargetSelectionSnapshot['selected'])
      : null,
    fillScreen: false,
    objectFit: 'contain',
    message: '',
  } as TargetSelectionSnapshot;
}

// Window-free paths only: applySelectedUrl without pushVisibleUrl, the session core, and the
// encrypted-blob previewRecord flows (the `blobId && captureStore` guard short-circuits before
// isCurrentSelectedImageUrl reaches window.location). The no-blob preview and pushVisibleUrl paths
// are covered by tests/dom/projection-application-controller.test.ts. Fakes implement only the
// touched members, Pick-typed via the deps interface.
function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const projections = new ProjectionSessionController();
  const selectedHandleId = options.selectedHandleId === undefined ? 'handle-1' : options.selectedHandleId;
  const selectedUrl = options.selectedUrl === undefined ? 'https://example.test/current.jpg' : options.selectedUrl;
  state = {
    ...state,
    target: { ...state.target, selectedHandleId, selectedUrl },
  };
  const preloadQueue = [...(options.preloadResults ?? [{ ok: true as const, displayUrl: 'blob:preloaded', sha256: 'f'.repeat(64) }])];

  const harnessRef: { current: Harness | null } = { current: null };
  const deps: ProjectionApplicationControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {
      log.push('render');
    },
    loadGrabSettings: async () => {
      log.push('loadGrabSettings');
    },
    scheduleFiniteCaptureErrorReset: (_updatedAt, mode, durationMs) => {
      log.push(`scheduleFiniteCaptureErrorReset:${mode}:${String(durationMs)}`);
    },
    saveFieldState: async () => {
      log.push('saveFieldState');
    },
    setExtensionProjectedPageUrl: (pageUrl) => {
      log.push(`setExtensionProjectedPageUrl:${pageUrl}`);
    },
    refreshBufferedNavPreloads: () => {
      log.push('refreshBufferedNavPreloads');
    },
    primeBufferedNav: () => {
      log.push('primeBufferedNav');
    },
    refreshBlobKeyStatus: async () => {
      log.push('refreshBlobKeyStatus');
    },
    saveUrlReviewStatus: async (status, sourceUrl, fieldIds, reason) => {
      log.push(`saveUrlReviewStatus:${status}:${sourceUrl}:${fieldIds.join(',')}:${reason ?? ''}`);
    },
    currentKnownImageFingerprint: () => options.baselineFingerprint ?? null,
    applyFieldLoadResult: (nextState, attemptedFieldIds, nextFingerprint, previousFingerprint) => {
      log.push(`applyFieldLoadResult:${attemptedFieldIds.join(',')}:${String(nextFingerprint)}:${String(previousFingerprint)}`);
      return { ...nextState, currentImageFingerprint: nextFingerprint ?? nextState.currentImageFingerprint };
    },
    pruneInvalidFieldSplitSpecsForUrl: (nextState, url, opts) => {
      log.push(`prune:${url}:${String(opts?.preserveMessage ?? false)}`);
      return nextState;
    },
    parsedFieldRequestContextKey: (attemptedFieldIds, direction, runId) => {
      log.push(`contextKey:${attemptedFieldIds.join(',')}:${String(direction)}:${runId}`);
      return `ctx:${runId}`;
    },
    currentSelectedUrl: () => state.target.selectedUrl,
    projectedSourceUrl: () => state.target.selectedUrl,
    findSelectedImage: (handleId) => (options.hasSelectedImage === false ? null : ({ handleId } as unknown as HTMLImageElement)),
    projections: () =>
      options.guardBlocked
        ? {
            beginGuarded: () => {
              log.push('beginGuarded:blocked');
              return {
                ok: false as const,
                warning: {
                  reason: 'selected-url-apply' as const,
                  sourceUrl: 'https://example.test/loop.jpg',
                  selectedHandleId,
                  originalSourceUrl: null,
                  repeatedCount: 6,
                  threshold: 6,
                  windowMs: 1500,
                },
              };
            },
            update: () => null,
            isActive: () => false,
          }
        : {
            beginGuarded: (o) => {
              log.push(`beginGuarded:${o.reason}`);
              return projections.beginGuarded(o);
            },
            update: (session, updates) => {
              log.push(`update:${String(updates.status)}`);
              return projections.update(session, updates);
            },
            isActive: (session) => projections.isActive(session),
          },
    neighborPreload: () => ({
      preload: async (url, preloadOptions) => {
        log.push(
          `preload:${url}:read=${String(preloadOptions?.readCache ?? true)}:write=${String(preloadOptions?.writeCache ?? true)}:intent=${String(preloadOptions?.intent)}:ctx=${String(preloadOptions?.contextKey)}`,
        );
        options.onPreload?.(() => harnessRef.current!);
        return preloadQueue.shift() ?? { ok: false as const, message: 'preload queue empty' };
      },
      runId: 7,
    }),
    pageAdapter: () => ({
      getSnapshot: () => makeSnapshot(selectedHandleId && selectedUrl ? { url: selectedUrl, handleId: selectedHandleId } : null),
      applyUrlToSelected: (url, displayUrl) => {
        log.push(`applyUrlToSelected:${url}:${displayUrl ?? url}`);
        options.onApplyUrlToSelected?.(() => harnessRef.current!);
        return makeSnapshot(selectedHandleId ? { url: displayUrl ?? url, handleId: selectedHandleId } : null);
      },
    }),
    captureStore: () => options.captureStore ?? null,
  };
  harnessRef.current = {
    controller: new ProjectionApplicationController(deps),
    log,
    projections,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
  return harnessRef.current;
}

test('applySelectedUrl happy path preloads with cache, applies the projection, and skips nav-only priming', async () => {
  const harness = createHarness({ baselineFingerprint: 'a'.repeat(64) });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/next.jpg');
  assert.equal(loaded, true);
  assert.deepEqual(harness.log, [
    'beginGuarded:selected-url-apply',
    'update:preloading',
    'preload:https://example.test/next.jpg:read=true:write=true:intent=url-editor-apply:ctx=undefined',
    'update:applying',
    'applyUrlToSelected:https://example.test/next.jpg:blob:preloaded',
    'applyFieldLoadResult::ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'prune:https://example.test/next.jpg:true',
    'saveUrlReviewStatus:passed:https://example.test/next.jpg::',
    'saveFieldState',
    'render',
    'loadGrabSettings',
  ]);
  assert.equal(harness.getState().target.selectedUrl, 'blob:preloaded');
  assert.equal(harness.getState().draftUrl, null);
  assert.ok(!harness.log.includes('primeBufferedNav'));
});

test('applySelectedUrl for parsed-field navigation disables the cache, forwards the runId context key, and primes buffered nav', async () => {
  const harness = createHarness({ baselineFingerprint: 'a'.repeat(64) });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/next.jpg', ['field-1', 'field-2'], {
    preloadDirection: 1,
  });
  assert.equal(loaded, true);
  assert.ok(harness.log.includes('beginGuarded:parsed-field-navigation'));
  assert.ok(harness.log.includes('contextKey:field-1,field-2:1:7'));
  assert.ok(harness.log.includes('preload:https://example.test/next.jpg:read=false:write=false:intent=field-active-navigation:ctx=ctx:7'));
  assert.equal(harness.log[harness.log.length - 1], 'primeBufferedNav');
});

test('applySelectedUrl quiet failure keeps the previous status/message, skips render and error reset, and refreshes nav preloads', async () => {
  const harness = createHarness({
    preloadResults: [{ ok: false, message: 'Image failed to load: offline' }],
  });
  harness.patchState({ status: 'ready', message: 'Previous message.', lastUpdatedAt: 123 });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/bad.jpg', ['field-1'], { quietFailure: true });
  assert.equal(loaded, false);
  const state = harness.getState();
  assert.equal(state.status, 'ready');
  assert.equal(state.message, 'Previous message.');
  assert.equal(state.lastUpdatedAt, 123);
  // The failure still lands in field/review state even though the alert is muted.
  assert.equal(state.failedFieldId, 'field-1');
  assert.equal(state.draftUrl, 'https://example.test/bad.jpg');
  assert.ok(harness.log.includes('update:failed'));
  assert.ok(harness.log.includes('saveUrlReviewStatus:failed:https://example.test/bad.jpg:field-1:Image failed to load: offline'));
  assert.ok(harness.log.includes('saveFieldState'));
  assert.ok(harness.log.includes('refreshBufferedNavPreloads'));
  assert.ok(!harness.log.includes('render'));
  assert.ok(!harness.log.some((entry) => entry.startsWith('scheduleFiniteCaptureErrorReset')));
});

test('applySelectedUrl quiet failure outside parsed-field navigation does not refresh nav preloads', async () => {
  const harness = createHarness({ preloadResults: [{ ok: false, message: 'Image failed to load: offline' }] });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/bad.jpg', [], { quietFailure: true });
  assert.equal(loaded, false);
  assert.ok(!harness.log.includes('refreshBufferedNavPreloads'));
});

test('applySelectedUrl loud failure replaces state, schedules the 1500 ms status reset, and renders', async () => {
  const harness = createHarness({ preloadResults: [{ ok: false, message: 'Image failed to load: offline' }] });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/bad.jpg', ['field-1']);
  assert.equal(loaded, false);
  const state = harness.getState();
  assert.equal(state.status, 'error');
  assert.equal(state.message, 'Image failed to load: offline');
  assert.ok(harness.log.includes('scheduleFiniteCaptureErrorReset:status:1500'));
  assert.ok(harness.log.includes('render'));
});

test('applySelectedUrl reports an unchanged image without projecting it', async () => {
  const fingerprint = 'a'.repeat(64);
  const harness = createHarness({
    baselineFingerprint: fingerprint,
    preloadResults: [{ ok: true, displayUrl: 'blob:unchanged', sha256: fingerprint }],
  });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/same.jpg', ['field-1']);
  assert.equal(loaded, false);
  assert.equal(harness.getState().message, 'Image loaded but did not change.');
  assert.equal(harness.getState().status, 'ready');
  assert.ok(harness.log.includes('update:loaded'));
  assert.ok(harness.log.includes(`saveUrlReviewStatus:unchanged:https://example.test/same.jpg:field-1:Image loaded but did not change.`));
  assert.ok(harness.log.includes('render'));
  assert.ok(!harness.log.some((entry) => entry.startsWith('applyUrlToSelected')));
});

test('applySelectedUrl aborts after the preload await when a newer session superseded it', async () => {
  const harness = createHarness({
    onPreload: (getHarness) => {
      getHarness().projections.begin({ reason: 'record-preview', sourceUrl: 'https://example.test/other.jpg' });
    },
  });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/next.jpg');
  assert.equal(loaded, false);
  assert.ok(!harness.log.some((entry) => entry.startsWith('applyUrlToSelected')));
  assert.ok(!harness.log.includes('render'));
  assert.equal(harness.getState().target.selectedUrl, 'https://example.test/current.jpg');
});

test('applySelectedUrl aborts when the selected target handle changes during the preload await', async () => {
  const harness = createHarness({
    onPreload: (getHarness) => {
      const state = getHarness().getState();
      getHarness().patchState({ target: { ...state.target, selectedHandleId: 'handle-2' } });
    },
  });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/next.jpg');
  assert.equal(loaded, false);
  assert.ok(!harness.log.some((entry) => entry.startsWith('applyUrlToSelected')));
});

test('beginProjectionSession surfaces the loop-guard block as an error state without preloading', async () => {
  const harness = createHarness({ guardBlocked: true });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/loop.jpg');
  assert.equal(loaded, false);
  assert.equal(harness.getState().status, 'error');
  assert.equal(harness.getState().message, 'Projection stopped because repeated host image requests looked like a loop.');
  assert.deepEqual(harness.log, ['beginGuarded:blocked', 'render']);
});

test('applySelectedUrl resetFieldState clears the parsed-field interaction state before loading', async () => {
  const harness = createHarness();
  harness.patchState({
    activeFieldId: 'field-1',
    failedFieldId: 'field-2',
    successfulFieldIds: ['field-1'],
    unchangedFieldIds: ['field-3'],
    unlockedFieldIds: ['field-1'],
    manuallyExcludedFieldIds: ['field-4'],
  });
  const loaded = await harness.controller.applySelectedUrl('https://example.test/next.jpg', [], { resetFieldState: true });
  assert.equal(loaded, true);
  const state = harness.getState();
  assert.equal(state.activeFieldId, null);
  assert.equal(state.failedFieldId, null);
  assert.deepEqual(state.successfulFieldIds, []);
  assert.deepEqual(state.unchangedFieldIds, []);
  assert.deepEqual(state.unlockedFieldIds, []);
  assert.deepEqual(state.manuallyExcludedFieldIds, []);
});

test('applyProjectionToSelectedImage refuses a stale session on both sides of the DOM apply', () => {
  const harness = createHarness();
  const first = harness.controller.beginProjectionSession('selected-url-apply', 'https://example.test/a.jpg');
  assert.ok(first);
  harness.projections.begin({ reason: 'record-preview', sourceUrl: 'https://example.test/b.jpg' });
  assert.equal(harness.controller.applyProjectionToSelectedImage(first, 'blob:a'), null);
  assert.ok(!harness.log.some((entry) => entry.startsWith('applyUrlToSelected')));

  const second = harness.controller.beginProjectionSession('selected-url-apply', 'https://example.test/c.jpg');
  assert.ok(second);
  const supersedingHarness = createHarness({
    onApplyUrlToSelected: (getHarness) => {
      getHarness().projections.begin({ reason: 'record-preview', sourceUrl: 'https://example.test/d.jpg' });
    },
  });
  const session = supersedingHarness.controller.beginProjectionSession('selected-url-apply', 'https://example.test/c.jpg');
  assert.ok(session);
  assert.equal(supersedingHarness.controller.applyProjectionToSelectedImage(session, 'blob:c'), null);
  assert.ok(supersedingHarness.log.some((entry) => entry.startsWith('applyUrlToSelected')));
});

function makeCaptureStore(
  log: string[],
  result:
    | { readonly ok: true; readonly dataUrl: string; readonly byteLength: number }
    | { readonly ok: false; readonly reason: string; readonly message: string },
  onRetrieve?: () => void,
): CaptureStore {
  return {
    requestRetrieveBlob: async (blobId: string) => {
      log.push(`requestRetrieveBlob:${blobId}`);
      onRetrieve?.();
      return result.ok
        ? {
            ok: true,
            blobId,
            dataUrl: result.dataUrl,
            mimeType: 'image/png',
            byteLength: result.byteLength,
            capturedAt: '2026-01-01T00:00:00.000Z',
          }
        : { ok: false, reason: result.reason, message: result.message };
    },
  } as unknown as CaptureStore;
}

test('previewRecord projects an encrypted original, reports its size, and clears the scroll anchor', async () => {
  const retrieveLog: string[] = [];
  const harness = createHarness({
    captureStore: makeCaptureStore(retrieveLog, { ok: true, dataUrl: 'data:image/png;base64,AAA', byteLength: 2048 }),
  });
  await harness.controller.previewRecord('https://example.test/original.jpg', 'blob-1', 'row-anchor');
  assert.equal(harness.getState().message, 'Projected encrypted original (2.0 KB).');
  assert.deepEqual(retrieveLog, ['requestRetrieveBlob:blob-1']);
  // The retrieved data URL is preloaded, then the session's source URL is applied with the preloaded display URL.
  assert.ok(harness.log.some((entry) => entry.startsWith('preload:data:image/png;base64,AAA')));
  assert.ok(harness.log.includes('applyUrlToSelected:https://example.test/original.jpg:blob:preloaded'));
  assert.equal(harness.controller.previewScrollAnchorId, null);
});

test('previewRecord refreshes the blob-key status on an encryption-locked retrieve and surfaces the error', async () => {
  const harness = createHarness({
    captureStore: makeCaptureStore([], { ok: false, reason: 'encryption-locked', message: 'Encrypted storage is locked.' }),
  });
  await harness.controller.previewRecord('https://example.test/original.jpg', 'blob-1', 'row-anchor');
  assert.equal(harness.getState().status, 'error');
  assert.equal(harness.getState().message, 'Encrypted storage is locked.');
  const refreshIndex = harness.log.indexOf('refreshBlobKeyStatus');
  const failedIndex = harness.log.indexOf('update:failed');
  assert.ok(refreshIndex >= 0 && failedIndex > refreshIndex);
  assert.equal(harness.controller.previewScrollAnchorId, null);
});

test('previewRecord superseded during the blob retrieve keeps the newer preview scroll anchor', async () => {
  let harnessRef: Harness | null = null;
  const store = makeCaptureStore([], { ok: true, dataUrl: 'data:image/png;base64,AAA', byteLength: 2048 }, () => {
    harnessRef?.projections.begin({ reason: 'record-preview', sourceUrl: 'https://example.test/newer.jpg' });
  });
  const harness = createHarness({ captureStore: store });
  harnessRef = harness;
  await harness.controller.previewRecord('https://example.test/original.jpg', 'blob-1', 'row-anchor');
  // The superseding preview owns the anchor now; the stale finally clause must not clear it.
  assert.equal(harness.controller.previewScrollAnchorId, 'row-anchor');
  assert.ok(!harness.log.some((entry) => entry.startsWith('applyUrlToSelected')));
  assert.ok(!harness.log.includes('update:failed'));
});

test('previewRecord with no selectable host image falls back to the encrypted-original guidance message', async () => {
  const harness = createHarness({
    selectedHandleId: null,
    captureStore: makeCaptureStore([], { ok: true, dataUrl: 'data:image/png;base64,AAA', byteLength: 2048 }),
  });
  await harness.controller.previewRecord('https://example.test/original.jpg', 'blob-1');
  assert.equal(harness.getState().status, 'error');
  assert.equal(harness.getState().message, 'Select a host image before previewing encrypted originals.');
  assert.ok(harness.log.includes('update:failed'));
});
