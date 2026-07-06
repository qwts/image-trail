import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { ProjectionSessionController } from '../../extension/src/core/projection-session.js';
import type { PanelState } from '../../extension/src/core/types.js';
import type { TargetSelectionSnapshot } from '../../extension/src/content/page-adapter.js';
import {
  ProjectionApplicationController,
  type ProjectionApplicationControllerDeps,
} from '../../extension/src/ui/panel/projection-application-controller.js';

// This suite runs under happy-dom (tests/dom/register.ts preload) to exercise the paths that read
// window.location: the isCurrentSelectedImageUrl already-projected short-circuit (which resolves
// relative URLs against the page), the pushVisibleUrl same-origin history push, and the no-blob
// preview flows against a real <img> element looked up via document.querySelector.
window.location.href = 'https://images.example.test/gallery';

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
  readonly preloadResults?: readonly PreloadResult[];
  /** Overrides the queue-based preload entirely (deferred/overlapping-load tests). */
  readonly preload?: (url: string) => Promise<PreloadResult>;
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

function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const projections = new ProjectionSessionController();
  const selectedHandleId = options.selectedHandleId === undefined ? 'handle-1' : options.selectedHandleId;
  const selectedUrl = options.selectedUrl === undefined ? 'https://images.example.test/img/current.jpg' : options.selectedUrl;
  state = { ...state, target: { ...state.target, selectedHandleId, selectedUrl } };
  const preloadQueue = [...(options.preloadResults ?? [{ ok: true as const, displayUrl: 'blob:preloaded', sha256: 'f'.repeat(64) }])];

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
    saveUrlReviewStatus: async (status, sourceUrl, fieldIds) => {
      log.push(`saveUrlReviewStatus:${status}:${sourceUrl}:${fieldIds.join(',')}`);
    },
    currentKnownImageFingerprint: () => null,
    applyFieldLoadResult: (nextState) => nextState,
    pruneInvalidFieldSplitSpecsForUrl: (nextState) => nextState,
    parsedFieldRequestContextKey: () => 'ctx',
    currentSelectedUrl: () => state.target.selectedUrl,
    projectedSourceUrl: () => state.target.selectedUrl,
    findSelectedImage: (handleId) => document.querySelector<HTMLImageElement>(`[data-image-trail-handle="${handleId}"]`),
    projections: () => ({
      beginGuarded: (o) => {
        log.push(`beginGuarded:${o.reason}`);
        return projections.beginGuarded(o);
      },
      update: (session, updates) => {
        log.push(`update:${String(updates.status)}`);
        return projections.update(session, updates);
      },
      isActive: (session) => projections.isActive(session),
    }),
    neighborPreload: () => ({
      preload: async (url) => {
        log.push(`preload:${url}`);
        if (options.preload) return options.preload(url);
        return preloadQueue.shift() ?? { ok: false as const, message: 'preload queue empty' };
      },
      runId: 7,
    }),
    pageAdapter: () => ({
      getSnapshot: () => makeSnapshot(selectedHandleId && selectedUrl ? { url: selectedUrl, handleId: selectedHandleId } : null),
      applyUrlToSelected: (url, displayUrl) => {
        log.push(`applyUrlToSelected:${url}:${displayUrl ?? url}`);
        return makeSnapshot(selectedHandleId ? { url: displayUrl ?? url, handleId: selectedHandleId } : null);
      },
    }),
    captureStore: () => null,
  };
  return {
    controller: new ProjectionApplicationController(deps),
    log,
    projections,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

function mountSelectedImage(handleId: string): HTMLImageElement {
  const image = document.createElement('img');
  image.setAttribute('data-image-trail-handle', handleId);
  document.body.append(image);
  return image;
}

test('previewRecord short-circuits without a session when the URL is already projected', async () => {
  const harness = createHarness();
  await harness.controller.previewRecord('https://images.example.test/img/current.jpg');
  assert.equal(harness.getState().message, 'Recent image is already projected into the selected host element.');
  assert.equal(harness.getState().status, 'ready');
  assert.ok(!harness.log.some((entry) => entry.startsWith('beginGuarded')));
  assert.deepEqual(harness.log, ['render']);
});

test('previewRecord resolves a relative URL against the page before deciding it is already projected', async () => {
  const harness = createHarness();
  await harness.controller.previewRecord('/img/current.jpg');
  assert.equal(harness.getState().message, 'Recent image is already projected into the selected host element.');
  assert.ok(!harness.log.some((entry) => entry.startsWith('beginGuarded')));
});

test('previewRecord fails with guidance when no selectable host image exists in the DOM', async () => {
  document.body.replaceChildren();
  const harness = createHarness();
  await harness.controller.previewRecord('https://images.example.test/img/other.jpg', undefined, 'row-anchor');
  assert.ok(!harness.log.some((entry) => entry.startsWith('beginGuarded')), 'the guard needs no projection session');
  assert.equal(harness.getState().status, 'error');
  assert.equal(harness.getState().message, 'Select a host image before previewing an image.');
  assert.equal(harness.controller.previewScrollAnchorId, null);
});

test('previewRecord loads a plain URL through the applySelectedUrl pipeline and clears the scroll anchor', async () => {
  document.body.replaceChildren();
  mountSelectedImage('handle-1');
  const harness = createHarness();
  await harness.controller.previewRecord('https://images.example.test/img/other.jpg', undefined, 'row-anchor');
  // The preview is a real record-preview load, not a side-channel projection: same session
  // reason, same projection application, and the same field-state persistence as the URL editor
  // and field +/- steps — which is what resets stale failure markers from the previous URL (#429).
  assert.ok(harness.log.includes('beginGuarded:record-preview'));
  const preloadingIndex = harness.log.indexOf('update:preloading');
  const applyingIndex = harness.log.indexOf('update:applying');
  const applyIndex = harness.log.findIndex((entry) => entry.startsWith('applyUrlToSelected'));
  assert.ok(preloadingIndex >= 0 && applyingIndex > preloadingIndex && applyIndex > applyingIndex);
  assert.ok(harness.log.includes('saveFieldState'), 'the preview persists field state like every other load');
  assert.equal(harness.getState().draftUrl, null);
  assert.equal(harness.controller.previewScrollAnchorId, null);
});

test('previewRecord clears a stale failed draft and failure markers from the previous URL (#429)', async () => {
  document.body.replaceChildren();
  mountSelectedImage('handle-1');
  const harness = createHarness();
  // A failed load leaves its address in draftUrl and marks the stepped field as failed; the
  // editor/fields derive from draftUrl first and the marker renders the field red.
  harness.patchState({ draftUrl: 'https://images.example.test/img/missing.jpg', failedFieldId: 'field-1', activeFieldId: 'field-1' });

  await harness.controller.previewRecord('https://images.example.test/img/other.jpg');

  assert.equal(harness.getState().draftUrl, null, 'a successful preview supersedes the failed draft');
  assert.equal(harness.getState().failedFieldId, null, 'the failed marker from the previous URL is reset');
  assert.equal(harness.getState().activeFieldId, null, 'field interaction state rebuilds from the projected URL');
});

test("a superseded preview does not clear the newer preview's scroll anchor (#434)", async () => {
  document.body.replaceChildren();
  mountSelectedImage('handle-1');
  const gates = new Map<string, (result: PreloadResult) => void>();
  const harness = createHarness({
    preload: (url) =>
      new Promise<PreloadResult>((resolve) => {
        gates.set(url, resolve);
      }),
  });

  // Preview A parks on its preload; preview B supersedes it and owns the anchor.
  const first = harness.controller.previewRecord('https://images.example.test/img/a.jpg', undefined, 'anchor-a');
  const second = harness.controller.previewRecord('https://images.example.test/img/b.jpg', undefined, 'anchor-b');
  assert.equal(harness.controller.previewScrollAnchorId, 'anchor-b');

  // The stale call settling (however its preload ends) must not clear the newer anchor.
  gates.get('https://images.example.test/img/a.jpg')?.({ ok: false, message: 'superseded' });
  await first;
  assert.equal(harness.controller.previewScrollAnchorId, 'anchor-b', 'the stale preview left the newer anchor alone');

  // The owning call clears its own anchor when it settles.
  gates.get('https://images.example.test/img/b.jpg')?.({ ok: true, displayUrl: 'blob:b', sha256: 'f'.repeat(64) });
  await second;
  assert.equal(harness.controller.previewScrollAnchorId, null);
});

test('applySelectedUrl pushes the visible URL only for same-origin loads', async () => {
  document.body.replaceChildren();
  mountSelectedImage('handle-1');
  const sameOrigin = createHarness();
  await sameOrigin.controller.applySelectedUrl('https://images.example.test/img/2.jpg', [], { pushVisibleUrl: true });
  assert.ok(sameOrigin.log.some((entry) => entry.startsWith('setExtensionProjectedPageUrl:https://images.example.test/')));

  const crossOrigin = createHarness();
  await crossOrigin.controller.applySelectedUrl('https://cdn.other.test/img/2.jpg', [], { pushVisibleUrl: true });
  assert.ok(!crossOrigin.log.some((entry) => entry.startsWith('setExtensionProjectedPageUrl')));
});
