import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelPosition, PanelPositionStore, PanelState } from '../../extension/src/core/types.js';
import { PanelPositionController, type PanelPositionControllerDeps } from '../../extension/src/ui/panel/panel-position-controller.js';

// This suite runs under happy-dom (tests/dom/register.ts preload) to exercise the pointer-event
// drag flow against real document listeners and the inline-style writes on a real element.
// happy-dom elements report a zero rect, so each test pins getBoundingClientRect to a fixed
// geometry; the viewport is happy-dom's default 1024x768.
window.location.href = 'https://images.example.test/gallery';

interface Harness {
  readonly controller: PanelPositionController;
  readonly log: string[];
  readonly root: HTMLElement;
  readonly saved: { hostname: string; position: PanelPosition }[];
  readonly removed: string[];
  getState(): PanelState;
}

function createHarness(options: { readonly savedPosition?: PanelPosition | null } = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const saved: { hostname: string; position: PanelPosition }[] = [];
  const removed: string[] = [];
  const root = document.createElement('div');
  document.body.append(root);
  Object.defineProperty(root, 'getBoundingClientRect', {
    value: () => ({ left: 100, top: 80, right: 400, bottom: 280, width: 300, height: 200 }),
  });
  const store: PanelPositionStore = {
    load: async () => options.savedPosition ?? null,
    save: async (hostname, position) => {
      saved.push({ hostname, position });
    },
    remove: async (hostname) => {
      removed.push(hostname);
    },
  };
  const deps: PanelPositionControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {
      log.push('render');
    },
    renderRecallOnly: () => {
      log.push('renderRecallOnly');
    },
    whenStylesReady: () => Promise.resolve(),
    root: () => root,
    panelPositionStore: () => store,
  };
  return {
    controller: new PanelPositionController(deps),
    log,
    root,
    saved,
    removed,
    getState: () => state,
  };
}

function pointerEvent(type: string, init: { button?: number; clientX: number; clientY: number }): PointerEvent {
  return new PointerEvent(type, { button: init.button ?? 0, clientX: init.clientX, clientY: init.clientY });
}

test('dragging moves the panel by pointer deltas, clamps to the viewport, and saves on pointerup', () => {
  const harness = createHarness();
  harness.controller.handlePanelDragStart(pointerEvent('pointerdown', { clientX: 150, clientY: 120 }));

  document.dispatchEvent(pointerEvent('pointermove', { clientX: 190, clientY: 100 }));
  assert.equal(harness.root.style.left, '140px');
  assert.equal(harness.root.style.top, '60px');
  assert.equal(harness.root.style.right, 'auto');
  assert.deepEqual(harness.log, ['renderRecallOnly']);

  // Dragging far past the right edge clamps to viewport - panel - padding: 1024 - 300 - 12.
  document.dispatchEvent(pointerEvent('pointermove', { clientX: 2000, clientY: 120 }));
  assert.equal(harness.root.style.left, '712px');
  assert.equal(harness.root.style.top, '80px');

  document.dispatchEvent(pointerEvent('pointerup', { clientX: 2000, clientY: 120 }));
  assert.deepEqual(harness.saved, [{ hostname: 'images.example.test', position: { left: 712, top: 80 } }]);

  // Listeners are removed on pointerup: further moves must not write styles or save again.
  document.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 300 }));
  assert.equal(harness.root.style.left, '712px');
  assert.equal(harness.saved.length, 1);
});

test('a non-primary-button press does not start a drag', () => {
  const harness = createHarness();
  harness.controller.handlePanelDragStart(pointerEvent('pointerdown', { button: 2, clientX: 150, clientY: 120 }));
  document.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 500 }));
  assert.equal(harness.root.style.left, '');
  assert.deepEqual(harness.log, []);
});

test('pointercancel ends the drag and persists the last clamped position', () => {
  const harness = createHarness();
  harness.controller.handlePanelDragStart(pointerEvent('pointerdown', { clientX: 150, clientY: 120 }));
  document.dispatchEvent(pointerEvent('pointermove', { clientX: 160, clientY: 130 }));
  document.dispatchEvent(pointerEvent('pointercancel', { clientX: 160, clientY: 130 }));
  assert.deepEqual(harness.saved, [{ hostname: 'images.example.test', position: { left: 110, top: 90 } }]);
});

test('restore-on-open clamps the persisted position and applies it to the root element', async () => {
  const harness = createHarness({ savedPosition: { left: 5000, top: -100 } });
  await harness.controller.ensurePanelPositionRestored();
  assert.equal(harness.root.style.left, '712px');
  assert.equal(harness.root.style.top, '12px');
  assert.equal(harness.root.style.right, 'auto');
  assert.deepEqual(harness.log, ['renderRecallOnly']);
});

test('resetPanelPosition removes the applied inline styles and the stored entry', async () => {
  const harness = createHarness({ savedPosition: { left: 200, top: 150 } });
  await harness.controller.ensurePanelPositionRestored();
  assert.equal(harness.root.style.left, '200px');
  await harness.controller.resetPanelPosition();
  assert.equal(harness.root.style.left, '');
  assert.equal(harness.root.style.top, '');
  assert.equal(harness.root.style.right, '');
  assert.deepEqual(harness.removed, ['images.example.test']);
  assert.equal(harness.getState().message, 'Panel position reset for this site.');
});
