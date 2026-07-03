import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelPosition, PanelPositionStore, PanelState } from '../extension/src/core/types.js';
import { PanelPositionController, type PanelPositionControllerDeps } from '../extension/src/ui/panel/panel-position-controller.js';

// This flat suite installs the minimal globals the controller reads (window.innerWidth/innerHeight
// for clamping, window.location for hostnameFromLocation, requestAnimationFrame for the layout
// settle), the same way tests/dom-observer.test.ts stubs them. The real pointer-event drag flow and
// inline-style writes are covered by tests/dom/panel-position-controller.test.ts under happy-dom.
globalThis.window = {
  innerWidth: 1024,
  innerHeight: 768,
  location: { hostname: 'images.example.test' },
} as unknown as Window & typeof globalThis;
globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
  callback(0);
  return 0;
}) as typeof requestAnimationFrame;

interface FakeRootStyle {
  left: string;
  top: string;
  right: string;
  removeProperty(name: string): void;
}

interface FakeRoot {
  readonly style: FakeRootStyle;
  getBoundingClientRect(): { width: number; height: number };
}

interface Harness {
  readonly controller: PanelPositionController;
  readonly log: string[];
  readonly root: FakeRoot;
  readonly saved: { hostname: string; position: PanelPosition }[];
  readonly removed: string[];
  loadCount(): number;
  getState(): PanelState;
}

interface HarnessOptions {
  readonly savedPosition?: PanelPosition | null;
  readonly load?: () => Promise<PanelPosition | null>;
  readonly hasRoot?: boolean;
  readonly hasStore?: boolean;
}

function createFakeRoot(): FakeRoot {
  const style: FakeRootStyle = {
    left: '',
    top: '',
    right: '',
    removeProperty(name: string): void {
      if (name === 'left') this.left = '';
      if (name === 'top') this.top = '';
      if (name === 'right') this.right = '';
    },
  };
  return {
    style,
    getBoundingClientRect: () => ({ width: 300, height: 200 }),
  };
}

function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const saved: { hostname: string; position: PanelPosition }[] = [];
  const removed: string[] = [];
  let loadCount = 0;
  const root = createFakeRoot();
  const store: PanelPositionStore = {
    load: async (hostname) => {
      loadCount += 1;
      log.push(`load:${hostname}`);
      if (options.load) return options.load();
      return options.savedPosition === undefined ? { left: 100, top: 50 } : options.savedPosition;
    },
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
    whenStylesReady: () => {
      log.push('whenStylesReady');
      return Promise.resolve();
    },
    root: () => (options.hasRoot === false ? null : (root as unknown as HTMLElement)),
    panelPositionStore: () => (options.hasStore === false ? null : store),
  };
  return {
    controller: new PanelPositionController(deps),
    log,
    root,
    saved,
    removed,
    loadCount: () => loadCount,
    getState: () => state,
  };
}

test('ensurePanelPositionRestored is single-flight: concurrent and repeat callers share one load', async () => {
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const harness = createHarness({ load: () => gate.then(() => ({ left: 100, top: 50 })) });
  const first = harness.controller.ensurePanelPositionRestored();
  const second = harness.controller.ensurePanelPositionRestored();
  release();
  await Promise.all([first, second]);
  assert.equal(harness.loadCount(), 1);
  await harness.controller.ensurePanelPositionRestored();
  assert.equal(harness.loadCount(), 1, 'a completed restore must stay memoized');
});

test('queuePanelPositionRestore starts one restore and no-ops while it is in flight or done', async () => {
  const harness = createHarness();
  harness.controller.queuePanelPositionRestore();
  harness.controller.queuePanelPositionRestore();
  await harness.controller.ensurePanelPositionRestored();
  assert.equal(harness.loadCount(), 1);
  harness.controller.queuePanelPositionRestore();
  assert.equal(harness.loadCount(), 1, 'a finished restore must not be re-queued');
});

test('restore clamps the saved position into the viewport, applies it, and renders the recall drawer', async () => {
  const harness = createHarness({ savedPosition: { left: 5000, top: -50 } });
  await harness.controller.ensurePanelPositionRestored();
  // 1024x768 viewport, 300x200 panel, 12px padding: left clamps to 712, top to 12.
  assert.equal(harness.root.style.left, '712px');
  assert.equal(harness.root.style.top, '12px');
  assert.equal(harness.root.style.right, 'auto');
  assert.deepEqual(harness.log, ['load:images.example.test', 'whenStylesReady', 'renderRecallOnly']);
});

test('a restore that resolves after invalidateRestore is discarded and a fresh attempt can start', async () => {
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const harness = createHarness({ load: () => gate.then(() => ({ left: 100, top: 50 })) });
  const stale = harness.controller.ensurePanelPositionRestored();
  harness.controller.invalidateRestore();
  release();
  await stale;
  assert.equal(harness.root.style.left, '', 'a stale restore must not write the panel position');
  assert.ok(!harness.log.includes('renderRecallOnly'));
  harness.controller.queuePanelPositionRestore();
  await harness.controller.ensurePanelPositionRestored();
  assert.equal(harness.loadCount(), 2, 'invalidation must allow a fresh restore attempt');
  assert.equal(harness.root.style.left, '100px');
});

test('restore marks itself done when nothing is saved so it is not retried on every render', async () => {
  const harness = createHarness({ savedPosition: null });
  await harness.controller.ensurePanelPositionRestored();
  assert.equal(harness.root.style.left, '');
  harness.controller.queuePanelPositionRestore();
  assert.equal(harness.loadCount(), 1);
});

test('restore is skipped without a root or a position store', async () => {
  const noRoot = createHarness({ hasRoot: false });
  await noRoot.controller.ensurePanelPositionRestored();
  assert.equal(noRoot.loadCount(), 0);

  const noStore = createHarness({ hasStore: false });
  await noStore.controller.ensurePanelPositionRestored();
  assert.deepEqual(noStore.log, []);
});

test('resetPanelPosition aborts the in-flight restore, clears stored and applied position, and reports', async () => {
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const harness = createHarness({ load: () => gate.then(() => ({ left: 100, top: 50 })) });
  const stale = harness.controller.ensurePanelPositionRestored();
  await harness.controller.resetPanelPosition();
  assert.deepEqual(harness.removed, ['images.example.test']);
  assert.equal(harness.getState().message, 'Panel position reset for this site.');
  assert.equal(harness.getState().status, 'ready');
  assert.deepEqual(harness.log.slice(-2), ['render', 'renderRecallOnly']);
  release();
  await stale;
  assert.equal(harness.root.style.left, '', 'the aborted restore must not re-apply a position after reset');
  harness.controller.queuePanelPositionRestore();
  assert.equal(harness.loadCount(), 1, 'reset must suppress further restores until the next mount');
});
