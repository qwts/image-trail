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
}

type PreloadResult = Awaited<ReturnType<ReturnType<ProjectionApplicationControllerDeps['neighborPreload']>['preload']>>;

interface HarnessOptions {
  readonly selectedHandleId?: string | null;
  readonly selectedUrl?: string | null;
  readonly preloadResults?: readonly PreloadResult[];
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
  assert.equal(harness.getState().status, 'error');
  assert.equal(harness.getState().message, 'Select a host image before previewing an image.');
  assert.ok(harness.log.includes('update:failed'));
  assert.equal(harness.controller.previewScrollAnchorId, null);
});

test('previewRecord projects a plain URL into the selected host element and clears the scroll anchor', async () => {
  document.body.replaceChildren();
  mountSelectedImage('handle-1');
  const harness = createHarness();
  await harness.controller.previewRecord('https://images.example.test/img/other.jpg', undefined, 'row-anchor');
  assert.equal(harness.getState().message, 'Projected image into selected host element.');
  const preloadingIndex = harness.log.indexOf('update:preloading');
  const applyingIndex = harness.log.indexOf('update:applying');
  const applyIndex = harness.log.findIndex((entry) => entry.startsWith('applyUrlToSelected'));
  assert.ok(preloadingIndex >= 0 && applyingIndex > preloadingIndex && applyIndex > applyingIndex);
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
