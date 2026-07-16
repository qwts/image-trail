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
  const detachedRoot = document.createElement('div');
  document.body.append(root, toastRoot, detachedRoot);
  const harness: Harness = {
    controller: undefined as unknown as PanelRenderController,
    root,
    toastRoot,
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
    dispatch: (action) => {
      log.push(`dispatch:${action.name}:${'password' in action ? action.password : ''}`);
    },
    root: () => root,
    contextRoot: () => null,
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
    onWorkspaceEdgesChanged: () => {},
  };
  (harness as { controller: PanelRenderController }).controller = new PanelRenderController(deps);
  return harness;
}

// Replaces window.setTimeout/clearTimeout with a manual queue so the finite-error reset callback can
// be fired deterministically. Returns a restore function.
function stubTimers(): { fire(): void; cleared(): boolean; delay(): number | undefined; restore(): void } {
  const realSet = window.setTimeout;
  const realClear = window.clearTimeout;
  let pending: (() => void) | null = null;
  let pendingDelay: number | undefined;
  let clearedFlag = false;
  (window as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((cb: () => void, delay?: number) => {
    pending = cb;
    pendingDelay = delay;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  (window as unknown as { clearTimeout: typeof clearTimeout }).clearTimeout = (() => {
    pending = null;
    clearedFlag = true;
  }) as typeof clearTimeout;
  return {
    fire: () => pending?.(),
    cleared: () => clearedFlag,
    delay: () => pendingDelay,
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

test('secure-session lock replaces panel and detached DOM, then restores layout and focus after unlock', () => {
  const harness = createHarness();
  harness.patchState({
    visible: true,
    blobKeyAvailable: true,
    blobKeyUnlocked: true,
    detachedSections: ['history'],
    bookmarks: [
      {
        id: 'private-pin',
        url: 'https://secret.example.test/private.jpg',
        label: 'Secret filename.jpg',
        timestamp: '2026-07-16T00:00:00.000Z',
        queueUpdatedAt: '2026-07-16T00:00:00.000Z',
        source: 'bookmark',
        thumbnail: 'data:image/png;base64,c2VjcmV0',
      },
    ],
  });
  harness.controller.render();
  const restore = harness.detachedRoot.querySelector<HTMLButtonElement>('[data-image-trail-restore="history"]');
  assert.ok(restore);
  restore.focus();
  harness.controller.showShortcutFeedback('Secret capture status');
  assert.equal(harness.toastRoot.textContent, 'Secret capture status');

  harness.patchState({ blobKeyUnlocked: false, message: 'Encrypted storage locked.' });
  harness.controller.render();
  const lock = harness.root.querySelector<HTMLElement>('[data-secure-workspace-lock="true"]');
  const password = lock?.querySelector<HTMLInputElement>('[data-secure-workspace-password="true"]');
  assert.ok(lock);
  assert.ok(password);
  assert.equal(document.activeElement, password, 'focus enters the lock form');
  assert.equal(harness.detachedRoot.childElementCount, 0, 'detached workspace DOM is removed');
  assert.equal(harness.root.textContent?.includes('Secret filename.jpg'), false);
  assert.equal(harness.root.innerHTML.includes('secret.example.test'), false);
  assert.equal(harness.root.querySelector('img'), null);
  assert.equal(harness.toastRoot.childElementCount, 0, 'locking removes out-of-band feedback');
  harness.controller.showShortcutFeedback('Late secret capture status');
  harness.controller.showBufferedNavigationToast('Late secret navigation status');
  assert.equal(harness.toastRoot.childElementCount, 0, 'locked workspaces reject delayed feedback');

  harness.patchState({ blobKeyUnlocked: true, status: 'ready', message: 'Encrypted storage unlocked.' });
  harness.controller.render();
  const restored = harness.detachedRoot.querySelector<HTMLButtonElement>('[data-image-trail-restore="history"]');
  assert.ok(restored, 'detached layout is restored');
  assert.equal(document.activeElement, restored, 'focus returns to the safely recreated control');
  assert.equal(harness.root.querySelector('[data-secure-workspace-lock="true"]'), null);
});

test('failed and in-progress unlock renders only the opaque lock surface without duplicate workspace DOM', () => {
  const harness = createHarness();
  harness.patchState({
    visible: true,
    blobKeyAvailable: true,
    blobKeyUnlocked: false,
    status: 'error',
    message: 'Password did not unlock encrypted storage.',
  });
  harness.controller.render();
  assert.equal(harness.root.querySelectorAll('[data-secure-workspace-lock="true"]').length, 1);
  assert.equal(harness.root.querySelectorAll('.image-trail-panel__header').length, 0);
  assert.equal(harness.root.querySelector('[role="alert"]')?.textContent, 'Password did not unlock encrypted storage.');
  const password = harness.root.querySelector<HTMLInputElement>('[data-secure-workspace-password="true"]');
  const form = password?.closest('form');
  assert.ok(password);
  assert.ok(form);
  password.value = 'correct horse';
  form.requestSubmit();
  assert.ok(harness.log.includes('dispatch:blob-key/unlock:correct horse'));
  assert.equal(password.value, '', 'the lock form clears its password after dispatch');

  harness.patchState({ status: 'ready', message: 'Unlocking secure workspace…' });
  harness.controller.render();
  assert.equal(harness.root.querySelectorAll('[data-secure-workspace-lock="true"]').length, 1);
  assert.equal(harness.root.querySelector('input')?.disabled, true);
  assert.equal(harness.root.querySelector('button')?.textContent, 'Unlocking…');
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

test('renderRecallOnly is a no-op while the opaque workspace lock is mounted', () => {
  const harness = createHarness();
  harness.patchState({ visible: true, blobKeyAvailable: true, blobKeyUnlocked: false });
  harness.controller.render();
  const lock = harness.root.querySelector('[data-secure-workspace-lock="true"]');
  assert.ok(lock);

  harness.controller.renderRecallOnly();

  assert.equal(
    harness.root.querySelector('[data-secure-workspace-lock="true"]'),
    lock,
    'Recall cannot recursively replace the lock surface',
  );
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

test('shortcut feedback matches the bottom-center contract and repeated calls reset its 1400ms timer', () => {
  const harness = createHarness();
  const timers = stubTimers();
  try {
    harness.controller.showShortcutFeedback('Captured original ✓');
    assert.equal(timers.delay(), 1_400);
    assert.ok(harness.toastRoot.classList.contains('has-shortcut-feedback'));
    assert.equal(harness.toastRoot.querySelector('.image-trail-panel__shortcut-feedback')?.textContent, 'Captured original ✓');

    harness.controller.showShortcutFeedback('Downloading current image…');
    assert.equal(timers.cleared(), true, 'the first dismissal timer is cleared');
    assert.equal(harness.toastRoot.querySelectorAll('.image-trail-panel__shortcut-feedback').length, 1);
    assert.equal(harness.toastRoot.textContent, 'Downloading current image…');
    timers.fire();
    assert.equal(harness.toastRoot.querySelector('.image-trail-panel__shortcut-feedback'), null);
  } finally {
    timers.restore();
  }
});

test('shortcut feedback survives panel renders and teardown clears its timer and DOM', () => {
  const harness = createHarness();
  const timers = stubTimers();
  try {
    harness.patchState({ visible: true });
    harness.controller.showShortcutFeedback('Pinned current image ✓');
    harness.controller.render();
    assert.equal(harness.toastRoot.textContent, 'Pinned current image ✓');
    harness.controller.clearShortcutFeedback();
    assert.equal(timers.cleared(), true);
    assert.equal(harness.toastRoot.childElementCount, 0);
    assert.ok(!harness.toastRoot.classList.contains('has-shortcut-feedback'));
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

test('an unchanged status toast is not rebuilt on re-render, so its enter animation cannot replay (#373)', () => {
  const harness = createHarness();
  harness.patchState({ visible: true, status: 'error', message: 'Image export failed for photo.jpg.' });

  harness.controller.render();
  const firstToast = harness.toastRoot.querySelector('.image-trail-panel__toast');
  assert.ok(firstToast, 'the error message renders a toast');

  harness.controller.render();
  assert.equal(
    harness.toastRoot.querySelector('.image-trail-panel__toast'),
    firstToast,
    'a re-render with the same message keeps the same toast element',
  );

  harness.patchState({ message: 'Image export failed for other.jpg.' });
  harness.controller.render();
  const changedToast = harness.toastRoot.querySelector('.image-trail-panel__toast');
  assert.ok(changedToast && changedToast !== firstToast, 'a changed message rebuilds the toast');
});

test('a render after the out-of-band buffered-skip toast rebuilds the status toast area (#373)', () => {
  const harness = createHarness();
  harness.patchState({ visible: true });
  harness.controller.render();

  harness.controller.showBufferedNavigationToast('Skipped 2 unavailable images.');
  assert.ok(harness.toastRoot.querySelector('.image-trail-panel__buffered-skip-toast'));

  // The skip toast wrote toastRoot outside renderStatusToast; the next render must not treat the
  // area as already up to date.
  harness.controller.render();
  assert.equal(harness.toastRoot.querySelector('.image-trail-panel__buffered-skip-toast'), null);
});
