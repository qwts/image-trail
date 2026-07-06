import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelState } from '../../extension/src/core/types.js';
import { emptyBufferedImageIndex } from '../../extension/src/core/url/buffered-image-navigation.js';
import type { BufferedNavigationDebugSnapshot } from '../../extension/src/ui/panel/buffered-navigation-controller.js';
import { PanelRenderController, type PanelRenderControllerDeps } from '../../extension/src/ui/panel/panel-render-controller.js';

// This suite runs under happy-dom (tests/dom/register.ts preload) to exercise the real render/toast/
// debug DOM writes, the focus capture/restore contract across renders, and the finite-error timer.
window.location.href = 'https://images.example.test/gallery';

interface Harness {
  readonly controller: PanelRenderController;
  readonly root: HTMLElement;
  readonly toastRoot: HTMLElement;
  readonly recallRoot: HTMLElement;
  readonly detachedRoot: HTMLElement;
  readonly log: string[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
  debugSnapshot: BufferedNavigationDebugSnapshot | null;
}

function createHarness(): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const root = document.createElement('div');
  const toastRoot = document.createElement('div');
  const recallRoot = document.createElement('div');
  const detachedRoot = document.createElement('div');
  document.body.append(root, toastRoot, recallRoot, detachedRoot);
  const harness: Harness = {
    controller: undefined as unknown as PanelRenderController,
    root,
    toastRoot,
    recallRoot,
    detachedRoot,
    log,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
    debugSnapshot: null,
  };
  const deps: PanelRenderControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    dispatch: () => {},
    root: () => root,
    recallRoot: () => recallRoot,
    detachedRoot: () => detachedRoot,
    toastRoot: () => toastRoot,
    panelStylesReady: () => true,
    previewScrollAnchorId: () => null,
    handlePanelDragStart: () => {},
    queuePanelPositionRestore: () => {
      log.push('queuePanelPositionRestore');
    },
    applyRestoredPanelPosition: () => {
      log.push('applyRestoredPanelPosition');
    },
    bufferedNavDebugSnapshot: () => harness.debugSnapshot,
    refreshRecallIfOpen: () => {
      log.push('refreshRecallIfOpen');
    },
    onWorkspaceLayoutChanged: () => {},
  };
  (harness as { controller: PanelRenderController }).controller = new PanelRenderController(deps);
  return harness;
}

// Replaces window.setTimeout/clearTimeout with a manual queue so the finite-error reset callback can
// be fired deterministically. Returns a restore function.
function stubTimers(): { fire(): void; cleared(): boolean; restore(): void } {
  const realSet = window.setTimeout;
  const realClear = window.clearTimeout;
  let pending: (() => void) | null = null;
  let clearedFlag = false;
  (window as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((cb: () => void) => {
    pending = cb;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  (window as unknown as { clearTimeout: typeof clearTimeout }).clearTimeout = (() => {
    pending = null;
    clearedFlag = true;
  }) as typeof clearTimeout;
  return {
    fire: () => pending?.(),
    cleared: () => clearedFlag,
    restore: () => {
      window.setTimeout = realSet;
      window.clearTimeout = realClear;
    },
  };
}

test('render populates the panel root and runs the position-restore + debug overlay steps', () => {
  const harness = createHarness();
  harness.patchState({ visible: true });
  harness.controller.render();
  assert.ok(harness.root.childElementCount > 0, 'renderPanel wrote panel DOM into the root');
  assert.deepEqual(harness.log, ['queuePanelPositionRestore', 'applyRestoredPanelPosition']);
});

test('render preserves focus on a button across a re-render (structural index)', () => {
  const harness = createHarness();
  harness.patchState({ visible: true });
  harness.controller.render();
  const button = harness.root.querySelector<HTMLButtonElement>('button');
  assert.ok(button, 'panel renders at least one button');
  button.focus();
  const index = Array.from(harness.root.querySelectorAll('button, input, select, textarea')).indexOf(button);
  harness.controller.render();
  const active = document.activeElement;
  assert.ok(active instanceof HTMLButtonElement, 'a button is refocused after the re-render');
  const newIndex = Array.from(harness.root.querySelectorAll('button, input, select, textarea')).indexOf(active);
  assert.equal(newIndex, index);
});

test('render preserves focus on a control inside a detached-section window across a re-render', () => {
  const harness = createHarness();
  harness.patchState({ visible: true, detachedSections: ['history'] });
  harness.controller.render();
  const restore = harness.detachedRoot.querySelector<HTMLButtonElement>('[data-image-trail-restore="history"]');
  assert.ok(restore, 'the detached window renders its restore control');
  restore.focus();
  harness.controller.render();
  const refocused = harness.detachedRoot.querySelector<HTMLButtonElement>('[data-image-trail-restore="history"]');
  assert.ok(refocused, 'the detached window re-renders its restore control');
  assert.equal(document.activeElement, refocused, 'focus stays inside the detached window across the re-render');
});

test('render restores a focused text input value and selection range across a re-render', () => {
  const harness = createHarness();
  harness.patchState({
    visible: true,
    target: { ...harness.getState().target, selectedUrl: 'https://images.example.test/a/1.jpg' },
  });
  harness.controller.render();
  const input = harness.root.querySelector<HTMLInputElement>('.image-trail-panel__full-url-input');
  assert.ok(input, 'the URL editor renders a full-url input when a target is selected');
  input.focus();
  input.value = 'https://images.example.test/a/2.jpg';
  input.setSelectionRange(4, 9);
  harness.controller.render();
  const restored = harness.root.querySelector<HTMLInputElement>('.image-trail-panel__full-url-input');
  assert.ok(restored);
  assert.equal(document.activeElement, restored);
  assert.equal(restored.value, 'https://images.example.test/a/2.jpg');
  assert.equal(restored.selectionStart, 4);
  assert.equal(restored.selectionEnd, 9);
});

test('renderRecallOnly rewrites only the recall root, leaving the panel root untouched', () => {
  const harness = createHarness();
  harness.patchState({ visible: true });
  harness.controller.render();
  const panelHtml = harness.root.innerHTML;
  harness.controller.renderRecallOnly();
  assert.equal(harness.root.innerHTML, panelHtml, 'the main panel DOM is not rebuilt by a recall-only render');
});

test('renderBufferedDebugOverlay renders one cell per buffer index and marks the cursor', () => {
  const harness = createHarness();
  harness.debugSnapshot = {
    cursor: 5,
    bufferN: 1,
    indices: new Map([
      [4, emptyBufferedImageIndex()],
      [5, emptyBufferedImageIndex()],
      [6, emptyBufferedImageIndex()],
    ]),
  };
  harness.controller.renderBufferedDebugOverlay();
  const overlay = harness.root.querySelector('.image-trail-panel__buffer-debug');
  assert.ok(overlay, 'debug overlay is appended');
  const cells = overlay.querySelectorAll('.image-trail-panel__buffer-debug-cell');
  assert.equal(cells.length, 3, 'one cell per index in [cursor-bufferN, cursor+bufferN]');
  assert.equal(overlay.querySelectorAll('.is-current').length, 1);
  assert.equal(overlay.querySelector('.is-current')?.textContent, '5');
});

test('renderBufferedDebugOverlay removes the overlay when there is no snapshot', () => {
  const harness = createHarness();
  harness.debugSnapshot = { cursor: 0, bufferN: 0, indices: new Map([[0, emptyBufferedImageIndex()]]) };
  harness.controller.renderBufferedDebugOverlay();
  assert.ok(harness.root.querySelector('.image-trail-panel__buffer-debug'));
  harness.debugSnapshot = null;
  harness.controller.renderBufferedDebugOverlay();
  assert.equal(harness.root.querySelector('.image-trail-panel__buffer-debug'), null);
});

test('showBufferedNavigationToast writes a toast, pulses the root, and dismisses on its timer', () => {
  const harness = createHarness();
  const timers = stubTimers();
  try {
    harness.controller.showBufferedNavigationToast('Skipped 2 URLs');
    assert.ok(harness.root.classList.contains('has-buffered-skip-pulse'));
    const toast = harness.toastRoot.querySelector('.image-trail-panel__buffered-skip-toast');
    assert.ok(toast, 'toast element is appended to the toast root');
    assert.equal(toast.querySelector('.image-trail-panel__toast-message')?.textContent, 'Skipped 2 URLs');
    timers.fire();
    assert.ok(!harness.root.classList.contains('has-buffered-skip-pulse'), 'pulse class removed on dismiss');
    assert.equal(harness.toastRoot.querySelector('.image-trail-panel__buffered-skip-toast'), null);
  } finally {
    timers.restore();
  }
});

test('scheduleFiniteCaptureErrorReset (status) resets an error to ready when the update is still current', () => {
  const harness = createHarness();
  const timers = stubTimers();
  try {
    harness.patchState({ status: 'error', message: 'boom', lastUpdatedAt: 1000 });
    harness.controller.scheduleFiniteCaptureErrorReset(1000, 'status');
    timers.fire();
    assert.equal(harness.getState().status, 'ready');
    assert.equal(harness.getState().message, 'Image Trail is ready.');
  } finally {
    timers.restore();
  }
});

test('scheduleFiniteCaptureErrorReset (status) leaves state alone when lastUpdatedAt moved on', () => {
  const harness = createHarness();
  const timers = stubTimers();
  try {
    harness.patchState({ status: 'error', message: 'boom', lastUpdatedAt: 1000 });
    harness.controller.scheduleFiniteCaptureErrorReset(1000, 'status');
    harness.patchState({ lastUpdatedAt: 2000 });
    timers.fire();
    assert.equal(harness.getState().status, 'error', 'a stale reset does not clobber newer state');
  } finally {
    timers.restore();
  }
});

test('scheduleFiniteCaptureErrorReset clears any pending timer before arming a new one', () => {
  const harness = createHarness();
  const timers = stubTimers();
  try {
    harness.controller.scheduleFiniteCaptureErrorReset(1, 'status');
    harness.controller.scheduleFiniteCaptureErrorReset(2, 'status');
    assert.ok(timers.cleared(), 'the previously armed timer is cleared');
  } finally {
    timers.restore();
  }
});

test('scheduleFiniteCaptureErrorReset (capture-result) clears a non-captured result', () => {
  const harness = createHarness();
  const timers = stubTimers();
  try {
    harness.patchState({
      captureResult: { status: 'failed', reason: 'network-error', message: 'nope' },
      lastUpdatedAt: 500,
    });
    harness.controller.scheduleFiniteCaptureErrorReset(500, 'capture-result');
    timers.fire();
    assert.equal(harness.getState().captureResult, null, 'the failed capture result is cleared');
    assert.equal(harness.getState().message, 'Image Trail is ready.');
  } finally {
    timers.restore();
  }
});
