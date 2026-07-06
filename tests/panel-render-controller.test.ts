import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import { PanelRenderController, type PanelRenderControllerDeps } from '../extension/src/ui/panel/panel-render-controller.js';

// Window-free paths only: every render/toast/debug method short-circuits when the panel root is
// absent, before any window/DOM access. The rendering, focus, toast, and timer paths run under
// happy-dom in tests/dom/panel-render-controller.test.ts.
interface Harness {
  readonly controller: PanelRenderController;
  readonly log: string[];
}

function createHarness(): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const deps: PanelRenderControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    dispatch: () => {
      log.push('dispatch');
    },
    root: () => null,
    recallRoot: () => null,
    detachedRoot: () => null,
    toastRoot: () => null,
    panelStylesReady: () => {
      log.push('panelStylesReady');
      return true;
    },
    previewScrollAnchorId: () => null,
    handlePanelDragStart: () => {},
    queuePanelPositionRestore: () => {
      log.push('queuePanelPositionRestore');
    },
    applyRestoredPanelPosition: () => {
      log.push('applyRestoredPanelPosition');
    },
    bufferedNavDebugSnapshot: () => {
      log.push('bufferedNavDebugSnapshot');
      return null;
    },
    refreshRecallIfOpen: () => {
      log.push('refreshRecallIfOpen');
    },
    onWorkspaceLayoutChanged: () => {},
  };
  return { controller: new PanelRenderController(deps), log };
}

test('render with no root is a no-op that reads no window/position APIs', () => {
  const { controller, log } = createHarness();
  controller.render();
  assert.deepEqual(log, []);
});

test('renderRecallOnly with no root is a no-op', () => {
  const { controller, log } = createHarness();
  controller.renderRecallOnly();
  assert.deepEqual(log, []);
});

test('renderBufferedDebugOverlay with no root returns before reading the snapshot', () => {
  const { controller, log } = createHarness();
  controller.renderBufferedDebugOverlay();
  assert.ok(!log.includes('bufferedNavDebugSnapshot'));
});

test('showBufferedNavigationToast with no root/toastRoot is a no-op', () => {
  const { controller } = createHarness();
  assert.doesNotThrow(() => controller.showBufferedNavigationToast('Skipped 3 URLs'));
});

test('renderPanelAndRefreshRecall refreshes the recall drawer after the (no-op) panel render', () => {
  const { controller, log } = createHarness();
  controller.renderPanelAndRefreshRecall();
  assert.deepEqual(log, ['refreshRecallIfOpen']);
});

test('clearFiniteCaptureErrorTimer is safe when no timer is pending', () => {
  const { controller } = createHarness();
  assert.doesNotThrow(() => controller.clearFiniteCaptureErrorTimer());
});
