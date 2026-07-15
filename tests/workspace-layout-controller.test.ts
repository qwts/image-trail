import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import {
  WORKSPACE_LAYOUT_KEY_VERSION,
  WORKSPACE_LAYOUT_SCHEMA_VERSION,
  floatingSection,
  railedSection,
  type DetachableSectionId,
  type PanelPosition,
  type StoredWorkspaceLayout,
  type WorkspaceLayout,
  type WorkspaceLayoutScope,
  type WorkspaceLayoutStore,
  type WorkspaceSectionLayout,
} from '../extension/src/core/workspace-layout.js';
import { WorkspaceLayoutController, type WorkspaceLayoutControllerDeps } from '../extension/src/ui/panel/workspace-layout-controller.js';

globalThis.window = {
  location: { hostname: 'images.example.test', href: 'https://images.example.test/gallery/42' },
  innerWidth: 1_440,
  innerHeight: 900,
  setTimeout: (callback: () => void): number => {
    queueMicrotask(callback);
    return 1;
  },
  clearTimeout: (): void => {},
} as unknown as Window & typeof globalThis;

class FakeWorkspaceLayoutStore implements WorkspaceLayoutStore {
  stored: StoredWorkspaceLayout | null = null;
  scope: WorkspaceLayoutScope | null = null;
  saves = 0;
  removes = 0;
  saveError: Error | null = null;
  loadError: Error | null = null;

  async load(scope: WorkspaceLayoutScope): Promise<StoredWorkspaceLayout | null> {
    this.scope = scope;
    if (this.loadError) throw this.loadError;
    return this.stored;
  }

  async save(scope: WorkspaceLayoutScope, layout: StoredWorkspaceLayout): Promise<void> {
    this.scope = scope;
    this.saves += 1;
    if (this.saveError) throw this.saveError;
    this.stored = layout;
  }

  async remove(scope: WorkspaceLayoutScope): Promise<void> {
    this.scope = scope;
    this.removes += 1;
    this.stored = null;
  }
}

interface Harness {
  readonly controller: WorkspaceLayoutController;
  readonly store: FakeWorkspaceLayoutStore;
  readonly placements: Map<DetachableSectionId, WorkspaceSectionLayout>;
  state(): PanelState;
  renders(): number;
  restoredPanelPosition(): PanelPosition | null;
}

function createHarness(initial?: Partial<PanelState>): Harness {
  let state: PanelState = { ...createInitialPanelState(), ...initial };
  let renders = 0;
  let restoredPanelPosition: PanelPosition | null = null;
  const store = new FakeWorkspaceLayoutStore();
  const placements = new Map<DetachableSectionId, WorkspaceSectionLayout>();
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
    saveLocalSettings: () => {},
    workspaceSections: () => placements,
    panelPosition: () => ({ left: 18, top: 24 }),
    restorePanelPosition: (position) => {
      restoredPanelPosition = position;
    },
  };
  return {
    controller: new WorkspaceLayoutController(deps),
    store,
    placements,
    state: () => state,
    renders: () => renders,
    restoredPanelPosition: () => restoredPanelPosition,
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

test('restore is opt-in and hydrates floating, rail, shade, and panel position', async () => {
  const off = createHarness({ restoreWorkspaceLayoutEnabled: false });
  off.store.stored = layout([floatingSection('history', null)]);
  off.controller.queueWorkspaceRestore();
  await flushAsync();
  assert.deepEqual(off.state().detachedSections, []);

  const on = createHarness({ restoreWorkspaceLayoutEnabled: true });
  on.store.stored = {
    ...layout([
      floatingSection('history', rect(40, 60), { collapsed: true }),
      railedSection('bookmarks', 'right', 0, { shaded: true, collapsed: true }),
    ]),
    panelPosition: { left: 8, top: 10 },
  };
  on.controller.queueWorkspaceRestore();
  await flushAsync();
  assert.deepEqual(on.state().detachedSections, ['history', 'bookmarks']);
  assert.deepEqual(on.placements.get('history'), floatingSection('history', rect(40, 60), { collapsed: true }));
  assert.equal(on.placements.get('bookmarks')?.shaded, true);
  assert.equal(on.state().historySectionOpen, false);
  assert.equal(on.state().bookmarksSectionOpen, false);
  assert.deepEqual(on.restoredPanelPosition(), { left: 8, top: 10 });
  assert.deepEqual(on.store.scope, { hostname: 'images.example.test', pageUrl: 'https://images.example.test/gallery/42' });
});

test('named placement transitions share one registry and persist changed v2 state', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true, detachedSections: ['history'] });
  harness.controller.prepareDetachedSection('history', rect(10, 12));
  harness.controller.snapSection('history', 'left');
  harness.controller.toggleSectionShade('history');
  await flushAsync();

  assert.deepEqual(harness.placements.get('history'), railedSection('history', 'left', 0, { shaded: true, floatingRect: rect(10, 12) }));
  assert.equal(harness.store.saves, 2);
  assert.equal(harness.store.stored?.schemaVersion, 2);
  assert.deepEqual(harness.store.stored?.panelPosition, { left: 18, top: 24 });

  harness.controller.moveSection('history', rect(80, 90));
  await flushAsync();
  assert.equal(harness.placements.get('history')?.mode, 'floating');
  assert.equal(harness.store.saves, 3);
});

test('opted-in attached collapse is captured in the same v2 section registry', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true, bookmarksSectionOpen: false });
  harness.controller.handleWorkspaceLayoutChanged();
  await flushAsync();
  assert.equal(harness.store.stored?.sections.find((section) => section.sectionId === 'bookmarks')?.collapsed, true);
});

test('invalid rail admission keeps the section floating without persisting a transient snap', () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true, detachedSections: ['history'] });
  harness.controller.prepareDetachedSection('history', rect(10, 12));
  Object.assign(window, { innerWidth: 800, innerHeight: 600 });
  harness.controller.snapSection('history', 'left');
  assert.equal(harness.placements.get('history')?.mode, 'floating');
  assert.equal(harness.store.saves, 0);
  Object.assign(window, { innerWidth: 1_440, innerHeight: 900 });
});

test('enabling captures immediately; disabling keeps the durable layout', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: false, detachedSections: ['controls'] });
  harness.controller.prepareDetachedSection('controls', rect(4, 6));
  harness.controller.updateWorkspaceLayoutRestore(true);
  await flushAsync();
  assert.equal(harness.store.saves, 1);
  assert.equal(harness.store.stored?.sections.find((section) => section.sectionId === 'controls')?.mode, 'floating');

  harness.controller.updateWorkspaceLayoutRestore(false);
  await flushAsync();
  assert.equal(harness.store.removes, 0);
  assert.notEqual(harness.store.stored, null);
});

test('reset removes durable state, clears the registry, and restores attached defaults', async () => {
  const harness = createHarness({
    restoreWorkspaceLayoutEnabled: true,
    detachedSections: ['history', 'bookmarks'],
    historySectionOpen: false,
    bookmarksSectionOpen: false,
  });
  harness.placements.set('history', floatingSection('history', rect(1, 2)));
  harness.store.stored = layout([...harness.placements.values()]);
  await harness.controller.resetWorkspaceLayout();

  assert.equal(harness.store.removes, 1);
  assert.deepEqual(harness.state().detachedSections, []);
  assert.equal(harness.state().historySectionOpen, true);
  assert.equal(harness.state().bookmarksSectionOpen, true);
  assert.equal(harness.placements.size, 0);
  assert.equal(harness.state().message, 'Workspace layout reset for this site.');
});

test('a restore invalidated by teardown never lands', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true });
  let release: (() => void) | undefined;
  harness.store.load = () => new Promise((resolve) => (release = () => resolve(layout([floatingSection('history', null)]))));
  harness.controller.queueWorkspaceRestore();
  await flushAsync();
  harness.controller.invalidateRestore();
  release?.();
  await flushAsync();
  assert.deepEqual(harness.state().detachedSections, []);
});

test('a rejected restore falls back to the current layout with privacy-safe feedback', async () => {
  const harness = createHarness({ visible: true, restoreWorkspaceLayoutEnabled: true });
  harness.store.loadError = new Error('private.example.test/gallery/secret');
  harness.controller.queueWorkspaceRestore();
  await flushAsync();

  assert.deepEqual(harness.state().detachedSections, []);
  assert.equal(harness.state().status, 'error');
  assert.equal(harness.state().message, 'The saved workspace layout could not be restored. Using the current layout.');
  assert.doesNotMatch(harness.state().message, /private|gallery|secret/iu);
});

test('a failed save does not poison the next workspace mutation', async () => {
  const harness = createHarness({ visible: true, restoreWorkspaceLayoutEnabled: true, detachedSections: ['history'] });
  harness.controller.prepareDetachedSection('history', rect(10, 12));
  harness.store.saveError = new Error('runtime disconnected');
  harness.controller.handleWorkspaceLayoutChanged();
  await flushAsync();
  assert.equal(harness.state().message, 'The workspace layout could not be saved.');

  harness.store.saveError = null;
  harness.controller.moveSection('history', rect(80, 90));
  await flushAsync();
  assert.equal(harness.store.stored?.sections.find((section) => section.sectionId === 'history')?.floatingRect?.left, 80);
});

test('reset is ordered after an in-flight save so stale geometry cannot reappear', async () => {
  const harness = createHarness({ restoreWorkspaceLayoutEnabled: true, detachedSections: ['history'] });
  harness.controller.prepareDetachedSection('history', rect(10, 12));
  let releaseSave: (() => void) | undefined;
  harness.store.save = async (scope, layoutToSave) => {
    harness.store.scope = scope;
    harness.store.saves += 1;
    await new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    harness.store.stored = layoutToSave;
  };
  harness.controller.handleWorkspaceLayoutChanged();
  await flushAsync();

  const reset = harness.controller.resetWorkspaceLayout();
  await flushAsync();
  assert.equal(harness.store.removes, 0);
  releaseSave?.();
  await reset;

  assert.equal(harness.store.removes, 1);
  assert.equal(harness.store.stored, null);
  assert.deepEqual(harness.state().detachedSections, []);
});

function layout(sections: StoredWorkspaceLayout['sections']): WorkspaceLayout {
  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    persistenceKeyVersion: WORKSPACE_LAYOUT_KEY_VERSION,
    panelPosition: null,
    sections: sections as WorkspaceLayout['sections'],
  };
}

function rect(left: number, top: number) {
  return { left, top, width: 340, height: 320 } as const;
}
