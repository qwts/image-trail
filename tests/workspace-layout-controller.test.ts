import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { DetachableSectionId, PanelPosition, PanelState, WorkspaceLayout, WorkspaceLayoutStore } from '../extension/src/core/types.js';
import { WorkspaceLayoutController, type WorkspaceLayoutControllerDeps } from '../extension/src/ui/panel/workspace-layout-controller.js';

// Minimal globals, following tests/panel-position-controller.test.ts: hostnameFromLocation reads
// window.location, and the debounced save runs through window.setTimeout — run it synchronously so
// assertions never need real timers.
globalThis.window = {
  location: { hostname: 'images.example.test' },
  setTimeout: (callback: () => void): number => {
    callback();
    return 1;
  },
  clearTimeout: (): void => {},
} as unknown as Window & typeof globalThis;

class FakeWorkspaceLayoutStore implements WorkspaceLayoutStore {
  stored: WorkspaceLayout | null = null;
  saves = 0;
  removes = 0;

  async load(): Promise<WorkspaceLayout | null> {
    return this.stored;
  }

  async save(_hostname: string, layout: WorkspaceLayout): Promise<void> {
    this.saves += 1;
    this.stored = layout;
  }

  async remove(): Promise<void> {
    this.removes += 1;
    this.stored = null;
  }
}

interface Harness {
  readonly controller: WorkspaceLayoutController;
  readonly store: FakeWorkspaceLayoutStore;
  readonly positions: Map<DetachableSectionId, PanelPosition>;
  readonly minimized: Set<DetachableSectionId>;
  state(): PanelState;
  setState(state: PanelState): void;
  renders(): number;
  savedSettings(): { restoreWorkspaceLayout: boolean } | null;
}

function createHarness(initial?: Partial<PanelState>): Harness {
  let state: PanelState = { ...createInitialPanelState(), ...initial };
  let renders = 0;
  let savedSettings: { restoreWorkspaceLayout: boolean } | null = null;
  const store = new FakeWorkspaceLayoutStore();
  const positions = new Map<DetachableSectionId, PanelPosition>();
  const minimized = new Set<DetachableSectionId>();
  const deps: WorkspaceLayoutControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {
      renders += 1;
    },
    workspaceLayoutStore: () => store,
    getLocalSettings: () => ({ restoreWorkspaceLayout: state.restoreWorkspaceLayoutEnabled }) as never,
    saveLocalSettings: (settings) => {
      savedSettings = settings as unknown as { restoreWorkspaceLayout: boolean };
    },
    detachedWindowPositions: () => positions,
    detachedWindowMinimized: () => minimized,
  };
  return {
    controller: new WorkspaceLayoutController(deps),
    store,
    positions,
    minimized,
    state: () => state,
    setState: (next) => {
      state = next;
    },
    renders: () => renders,
    savedSettings: () => savedSettings,
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

test('queueWorkspaceRestore is a no-op while the opt-in setting is off', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: false });
  harness.store.stored = { sections: [{ sectionId: 'history', position: null, minimized: false }] };

  harness.controller.queueWorkspaceRestore();
  await flushAsync();

  assert.deepEqual(harness.state().detachedSections, []);
  assert.equal(harness.renders(), 0);
});

test('restore hydrates detached sections, positions, and minimized state from the saved layout', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true });
  harness.store.stored = {
    sections: [
      { sectionId: 'history', position: { left: 40, top: 60 }, minimized: false },
      { sectionId: 'bookmarks', position: null, minimized: true },
    ],
  };

  harness.controller.queueWorkspaceRestore();
  await flushAsync();

  assert.deepEqual(harness.state().detachedSections, ['history', 'bookmarks']);
  assert.deepEqual(harness.positions.get('history'), { left: 40, top: 60 });
  assert.equal(harness.positions.has('bookmarks'), false);
  assert.equal(harness.minimized.has('bookmarks'), true);
  assert.equal(harness.renders(), 1);
});

test('restore drops section ids the current build does not know', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true });
  harness.store.stored = {
    sections: [
      { sectionId: 'time-machine' as DetachableSectionId, position: null, minimized: false },
      { sectionId: 'controls', position: null, minimized: false },
    ],
  };

  harness.controller.queueWorkspaceRestore();
  await flushAsync();

  assert.deepEqual(harness.state().detachedSections, ['controls']);
});

test('handleWorkspaceLayoutChanged persists the captured layout only when enabled and changed', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true, detachedSections: ['history'] });
  harness.positions.set('history', { left: 10, top: 12 });

  harness.controller.handleWorkspaceLayoutChanged();
  await flushAsync();
  assert.equal(harness.store.saves, 1);
  assert.deepEqual(harness.store.stored, {
    sections: [{ sectionId: 'history', position: { left: 10, top: 12 }, minimized: false }],
  });

  // Unchanged layout → no second write.
  harness.controller.handleWorkspaceLayoutChanged();
  await flushAsync();
  assert.equal(harness.store.saves, 1);

  harness.positions.set('history', { left: 99, top: 12 });
  harness.controller.handleWorkspaceLayoutChanged();
  await flushAsync();
  assert.equal(harness.store.saves, 2);
});

test('handleWorkspaceLayoutChanged never writes while the setting is off', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: false, detachedSections: ['history'] });

  harness.controller.handleWorkspaceLayoutChanged();
  await flushAsync();

  assert.equal(harness.store.saves, 0);
});

test('enabling the setting saves it and captures the current arrangement immediately', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: false, detachedSections: ['controls'] });

  harness.controller.updateWorkspaceLayoutRestore(true);
  await flushAsync();

  assert.equal(harness.state().restoreWorkspaceLayoutEnabled, true);
  assert.equal(harness.savedSettings()?.restoreWorkspaceLayout, true);
  assert.equal(harness.store.saves, 1);
  assert.deepEqual(
    harness.store.stored?.sections.map((section) => section.sectionId),
    ['controls'],
  );
  assert.equal(harness.renders(), 1);
});

test('disabling the setting stops persisting but keeps the stored layout', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true, detachedSections: ['controls'] });
  harness.store.stored = { sections: [{ sectionId: 'controls', position: null, minimized: false }] };

  harness.controller.updateWorkspaceLayoutRestore(false);
  await flushAsync();

  assert.equal(harness.state().restoreWorkspaceLayoutEnabled, false);
  assert.equal(harness.store.removes, 0);
  assert.notEqual(harness.store.stored, null);
});

test('resetWorkspaceLayout clears the stored layout, session geometry, and reattaches every section', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true, detachedSections: ['history', 'bookmarks'] });
  harness.store.stored = { sections: [{ sectionId: 'history', position: { left: 1, top: 2 }, minimized: false }] };
  harness.positions.set('history', { left: 1, top: 2 });
  harness.minimized.add('bookmarks');

  await harness.controller.resetWorkspaceLayout();

  assert.equal(harness.store.removes, 1);
  assert.deepEqual(harness.state().detachedSections, []);
  assert.equal(harness.positions.size, 0);
  assert.equal(harness.minimized.size, 0);
  assert.equal(harness.state().message, 'Workspace layout reset for this site.');
});

test('a restore invalidated by teardown never lands on the remounted panel', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true });
  let release: (() => void) | undefined;
  harness.store.load = () =>
    new Promise((resolve) => {
      release = () => resolve({ sections: [{ sectionId: 'history', position: null, minimized: false }] });
    });

  harness.controller.queueWorkspaceRestore();
  await flushAsync();
  harness.controller.invalidateRestore();
  release?.();
  await flushAsync();

  assert.deepEqual(harness.state().detachedSections, []);
});
