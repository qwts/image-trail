import test from 'node:test';
import assert from 'node:assert/strict';

import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelAction, PanelState } from '../../extension/src/core/types.js';
import { floatingSection, railedSection } from '../../extension/src/core/workspace-layout.js';
import { renderPanel, type PanelLayoutState, type PanelRenderTarget } from '../../extension/src/ui/render.js';

const record: ImageDisplayRecord = {
  id: 'recent-1',
  url: 'https://images.example.test/recent/photo_0042.jpg',
  timestamp: '2026-06-25T15:30:00.000Z',
  source: 'history',
};

interface Harness {
  readonly root: HTMLElement;
  readonly detachedRoot: HTMLElement;
  readonly layoutState: PanelLayoutState;
  readonly actions: PanelAction[];
  render(state: PanelState): void;
}

function createHarness(): Harness {
  const root = document.createElement('div');
  const detachedRoot = document.createElement('div');
  document.body.append(root, detachedRoot);
  const actions: PanelAction[] = [];
  const layoutState: PanelLayoutState = {
    fieldsPanelOpen: false,
    fieldsPanelBlockSize: null,
    historyListBlockSize: null,
    fieldDisplayModes: new Map(),
    workspaceSections: new Map(),
    collapsibleListScrollTops: new Map(),
    primaryPanelScrollTop: null,
    destinationScrollTops: new Map(),
  };
  const target: PanelRenderTarget = { root, detachedRoot, dispatch: (action) => actions.push(action), layoutState };
  return { root, detachedRoot, layoutState, actions, render: (state) => renderPanel(target, state) };
}

function panelState(overrides: Partial<PanelState> = {}): PanelState {
  return {
    ...createInitialPanelState(0),
    visible: true,
    status: 'ready',
    history: [record],
    bookmarks: [{ ...record, id: 'queue-1', source: 'bookmark' }],
    bookmarkTotal: 1,
    ...overrides,
  };
}

test('every registered section detaches through the same control, placeholder, and React workspace', () => {
  const entries = [
    ['target', 'Host target'],
    ['url-editor', 'URL editor'],
    ['fields', 'Field Editor'],
    ['controls', 'Manual controls'],
    ['history', 'Recent history'],
    ['bookmarks', 'Queue'],
  ] as const;
  for (const [id, title] of entries) {
    const attached = createHarness();
    attached.render(panelState());
    const detach = attached.root.querySelector<HTMLButtonElement>(`[data-image-trail-detach="${id}"]`);
    assert.ok(detach, `${id} exposes a detach action`);
    detach.click();
    assert.deepEqual(attached.actions, [{ name: 'section/detach', sectionId: id }]);

    const detached = createHarness();
    detached.render(panelState({ detachedSections: [id] }));
    assert.ok(detached.root.querySelector(`[data-image-trail-detached-placeholder="${id}"]`));
    const windowElement = detached.detachedRoot.querySelector<HTMLElement>(`[data-image-trail-detached-window="${id}"]`);
    assert.ok(windowElement);
    assert.equal(windowElement.getAttribute('aria-label'), `${title} (floating)`);
    assert.equal(windowElement.dataset['workspaceSizeMode'], id === 'history' || id === 'bookmarks' ? 'auto' : 'user');
    assert.ok(windowElement.querySelector(`[data-image-trail-resize="${id}"]`));
    assert.equal(detached.detachedRoot.querySelector('[data-image-trail-workspace="react"]') !== null, true);
  }
});

test('floating resize control commits user-owned geometry and stays available after rerender', () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('history', floatingSection('history', { left: 200, top: 80, width: 340, height: 320 }));
  harness.render(panelState({ detachedSections: ['history'] }));
  const windowElement = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  const resize = windowElement?.querySelector<HTMLButtonElement>('[data-image-trail-resize="history"]');
  assert.ok(windowElement && resize);
  windowElement.getBoundingClientRect = () => ({
    left: 200,
    top: 80,
    right: 540,
    bottom: 400,
    width: 340,
    height: 320,
    x: 200,
    y: 80,
    toJSON: () => ({}),
  });

  resize.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.deepEqual(harness.actions, [
    { name: 'workspace/resize', sectionId: 'history', floatingRect: { left: 200, top: 80, width: 340, height: 336 } },
  ]);

  harness.layoutState.workspaceSections.set(
    'history',
    floatingSection('history', { left: 200, top: 80, width: 340, height: 336 }, { floatingSizeMode: 'user' }),
  );
  harness.render(panelState({ detachedSections: ['history'] }));
  const rerendered = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.equal(rerendered?.dataset['workspaceSizeMode'], 'user');
  assert.ok(rerendered?.querySelector('[data-image-trail-resize="history"]'));
});

test('surface drag engages at the fine-pointer threshold and records one floating placement', () => {
  const harness = createHarness();
  harness.render(panelState());
  const section = harness.root.querySelector<HTMLElement>('.image-trail-panel__history-section');
  const heading = section?.querySelector<HTMLElement>('.image-trail-panel__section-header h3');
  assert.ok(section && heading);
  (section as HTMLElement & { setPointerCapture(id: number): void; releasePointerCapture(id: number): void }).setPointerCapture = () => {};
  (section as HTMLElement & { setPointerCapture(id: number): void; releasePointerCapture(id: number): void }).releasePointerCapture =
    () => {};

  heading.dispatchEvent(pointer('pointerdown', 60, 60));
  window.dispatchEvent(pointer('pointermove', 66, 60));
  window.dispatchEvent(pointer('pointerup', 66, 60));
  assert.deepEqual(harness.actions, [], 'six pixels remains below the eight-pixel fine threshold');

  heading.dispatchEvent(pointer('pointerdown', 60, 60));
  window.dispatchEvent(pointer('pointermove', 320, 240));
  window.dispatchEvent(pointer('pointerup', 320, 240));
  assert.deepEqual(harness.actions, [{ name: 'section/detach', sectionId: 'history' }]);
  assert.deepEqual(harness.layoutState.workspaceSections.get('history')?.floatingRect, {
    left: 296,
    top: 228,
    width: 340,
    height: 320,
  });
});

test('interactive controls never become surface drag origins', () => {
  const harness = createHarness();
  harness.render(panelState());
  const button = harness.root.querySelector<HTMLButtonElement>('.image-trail-panel__history-actions button');
  assert.ok(button);
  button.dispatchEvent(pointer('pointerdown', 60, 60));
  window.dispatchEvent(pointer('pointermove', 320, 240));
  window.dispatchEvent(pointer('pointerup', 320, 240));
  assert.equal(harness.actions.length, 0);
});

test('floating geometry clamps to the viewport and scroll survives React rerenders', () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('history', floatingSection('history', { left: 5000, top: 4000, width: 340, height: 320 }));
  harness.render(panelState({ detachedSections: ['history'] }));
  const windowElement = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowElement);
  assert.notEqual(windowElement.style.left, '5000px');
  assert.notEqual(windowElement.style.top, '4000px');

  const list = windowElement.querySelector<HTMLElement>('.image-trail-panel__record-list');
  assert.ok(list);
  list.scrollTop = 42;
  harness.render(panelState({ detachedSections: ['history'] }));
  assert.equal(harness.detachedRoot.querySelector<HTMLElement>('.image-trail-panel__record-list')?.scrollTop, 42);
});

test('floating chrome dispatches shade, restore, and keyboard snap actions', async () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('history', floatingSection('history', { left: 200, top: 80, width: 340, height: 320 }));
  harness.render(panelState({ detachedSections: ['history'] }));
  const windowElement = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowElement);

  windowElement.querySelector<HTMLButtonElement>('[data-image-trail-shade="history"]')?.click();
  windowElement.querySelector<HTMLButtonElement>('[data-image-trail-restore="history"]')?.click();
  const header = windowElement.querySelector<HTMLElement>('.image-trail-workspace__window-header');
  assert.ok(header);
  header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
  await flushReact();
  const preview = harness.detachedRoot.querySelector('[data-edge="right"].image-trail-workspace__snap-preview');
  assert.ok(preview);
  assert.match(preview.textContent ?? '', /right dock · position 1/u);
  header.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));

  assert.deepEqual(harness.actions, [
    { name: 'workspace/shade', sectionId: 'history' },
    { name: 'section/restore', sectionId: 'history' },
    { name: 'workspace/snap', sectionId: 'history', edge: 'right' },
  ]);
});

test('floating pointer movement previews a rail and commits one named snap action', async () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('history', floatingSection('history', { left: 200, top: 80, width: 340, height: 320 }));
  harness.render(panelState({ detachedSections: ['history'] }));
  const header = harness.detachedRoot.querySelector<HTMLElement>('.image-trail-workspace__window-header');
  assert.ok(header);
  header.dispatchEvent(pointer('pointerdown', 220, 90));
  window.dispatchEvent(pointer('pointermove', 1, 200));
  await flushReact();
  assert.ok(harness.detachedRoot.querySelector('[data-edge="left"].image-trail-workspace__snap-preview'));
  window.dispatchEvent(pointer('pointerup', 1, 200));
  assert.deepEqual(harness.actions, [{ name: 'workspace/snap', sectionId: 'history', edge: 'left' }]);
});

test('Escape cancels a floating drag and removes its global gesture listeners', async () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('history', floatingSection('history', { left: 200, top: 80, width: 340, height: 320 }));
  harness.render(panelState({ detachedSections: ['history'] }));
  const header = harness.detachedRoot.querySelector<HTMLElement>('.image-trail-workspace__window-header');
  assert.ok(header);
  header.dispatchEvent(pointer('pointerdown', 220, 90));
  window.dispatchEvent(pointer('pointermove', 1, 200));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await flushReact();
  window.dispatchEvent(pointer('pointerup', 1, 200));
  assert.equal(harness.detachedRoot.querySelector('.image-trail-workspace__snap-preview'), null);
  assert.deepEqual(harness.actions, []);
});

test('invalid keyboard rail geometry previews an accessible floating fallback without dispatch', async () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('history', floatingSection('history', { left: 200, top: 80, width: 340, height: 320 }));
  harness.render(panelState({ detachedSections: ['history'] }));
  const header = harness.detachedRoot.querySelector<HTMLElement>('.image-trail-workspace__window-header');
  assert.ok(header);
  Object.assign(window, { innerWidth: 800, innerHeight: 600 });
  header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
  await flushReact();
  const preview = harness.detachedRoot.querySelector('.image-trail-workspace__snap-preview.is-fallback[data-edge="left"]');
  assert.ok(preview);
  assert.match(preview.textContent ?? '', /keep floating/u);
  assert.match(harness.detachedRoot.textContent, /will stay floating because the left rail leaves too little center space/u);
  header.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
  assert.equal(harness.actions.length, 0);
  Object.assign(window, { innerWidth: 1_024, innerHeight: 768 });
});

test('editable detached controls retain Alt+Arrow without previewing or snapping the window', async () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('settings', floatingSection('settings', { left: 200, top: 80, width: 420, height: 500 }));
  harness.render(panelState({ detachedSections: ['settings'], activeDestination: 'settings' }));
  const input = harness.detachedRoot.querySelector<HTMLInputElement>('[data-image-trail-detached-window="settings"] input');
  assert.ok(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
  await flushReact();
  assert.equal(harness.detachedRoot.querySelector('.image-trail-workspace__snap-preview'), null);
  assert.deepEqual(harness.actions, []);
});

test('React workspace status describes private-safe placement, order, and shade state', () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('history', railedSection('history', 'left', 1, { shaded: true }));
  harness.render(panelState({ detachedSections: ['history'] }));
  const status = harness.detachedRoot.querySelector<HTMLElement>('[role="status"]');
  assert.equal(status?.textContent, 'Recent history docked to left rail, position 2, shaded');
});

test('rail stacks honor order and expose unsnap, reorder, shade, and restore paths', () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('history', railedSection('history', 'left', 1));
  harness.layoutState.workspaceSections.set('bookmarks', railedSection('bookmarks', 'left', 0));
  harness.render(panelState({ detachedSections: ['history', 'bookmarks'] }));
  const cards = [...harness.detachedRoot.querySelectorAll<HTMLElement>('[data-workspace-mode="railed"]')];
  assert.deepEqual(
    cards.map((card) => card.dataset['imageTrailDetachedWindow']),
    ['bookmarks', 'history'],
  );

  cards[0]?.querySelector<HTMLButtonElement>('[data-image-trail-unsnap="bookmarks"]')?.click();
  cards[0]?.querySelector<HTMLButtonElement>('[data-image-trail-shade="bookmarks"]')?.click();
  cards[0]?.querySelectorAll<HTMLButtonElement>('.image-trail-workspace__window-actions button')[1]?.click();
  cards[0]?.querySelector<HTMLButtonElement>('[data-image-trail-restore="bookmarks"]')?.click();
  assertFirstActionName(harness.actions, 'workspace/unsnap');
  assert.deepEqual(harness.actions.slice(1), [
    { name: 'workspace/shade', sectionId: 'bookmarks' },
    { name: 'workspace/reorder', sectionId: 'bookmarks', edge: 'left', order: 1 },
    { name: 'section/restore', sectionId: 'bookmarks' },
  ]);
});

test('railed title drag unsnaps only after threshold release and cancel keeps the rail', () => {
  const harness = createHarness();
  harness.layoutState.workspaceSections.set('history', railedSection('history', 'left', 0));
  harness.render(panelState({ detachedSections: ['history'] }));
  const header = harness.detachedRoot.querySelector<HTMLElement>('[data-workspace-mode="railed"] .image-trail-workspace__window-header');
  assert.ok(header);

  header.dispatchEvent(pointer('pointerdown', 40, 40));
  window.dispatchEvent(pointer('pointermove', 200, 200));
  window.dispatchEvent(pointer('pointercancel', 200, 200));
  assert.deepEqual(harness.actions, []);

  header.dispatchEvent(pointer('pointerdown', 40, 40));
  window.dispatchEvent(pointer('pointermove', 500, 300));
  window.dispatchEvent(pointer('pointerup', 500, 300));
  assertFirstActionName(harness.actions, 'workspace/unsnap');
});

test('panel minimization clears the workspace without persisting recents-like state', () => {
  const harness = createHarness();
  harness.render(panelState({ detachedSections: ['history'] }));
  assert.ok(harness.detachedRoot.querySelector('[data-image-trail-detached-window="history"]'));
  const header = harness.detachedRoot.querySelector<HTMLElement>('.image-trail-workspace__window-header');
  header?.dispatchEvent(pointer('pointerdown', 200, 100));
  window.dispatchEvent(pointer('pointermove', 300, 200));
  harness.render(panelState({ detachedSections: ['history'], minimized: true }));
  window.dispatchEvent(pointer('pointerup', 300, 200));
  assert.equal(harness.detachedRoot.querySelector('[data-image-trail-detached-window="history"]'), null);
  assert.equal(harness.actions.length, 0);
});

function pointer(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { button: 0, clientX, clientY, bubbles: true, cancelable: true });
}

async function flushReact(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function assertFirstActionName(actions: readonly PanelAction[], name: PanelAction['name']): void {
  assert.equal(actions[0]?.name, name);
}
