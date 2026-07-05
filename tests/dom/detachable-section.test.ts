import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import type { PanelState } from '../../extension/src/core/types.js';
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
  readonly actions: unknown[];
  render(state: PanelState): void;
}

function createHarness(): Harness {
  const root = document.createElement('div');
  const detachedRoot = document.createElement('div');
  document.body.append(root, detachedRoot);
  const actions: unknown[] = [];
  const layoutState: PanelLayoutState = {
    fieldsPanelOpen: false,
    fieldsPanelBlockSize: null,
    historyListBlockSize: null,
    fieldDisplayModes: new Map(),
    detachedWindowPositions: new Map(),
    detachedWindowMinimized: new Set(),
  };
  const target: PanelRenderTarget = {
    root,
    detachedRoot,
    dispatch: (action) => actions.push(action),
    layoutState,
  };
  return {
    root,
    detachedRoot,
    layoutState,
    actions,
    render: (state) => renderPanel(target, state, { renderRecall: false }),
  };
}

function panelState(overrides: Partial<PanelState> = {}): PanelState {
  return {
    ...createInitialPanelState(0),
    visible: true,
    status: 'ready',
    history: [record],
    ...overrides,
  };
}

test('the Settings header renders a detach control that dispatches section/detach', () => {
  const harness = createHarness();
  harness.render(panelState({ settingsOpen: true }));

  const detach = harness.root.querySelector<HTMLButtonElement>('[data-image-trail-detach="settings"]');
  assert.ok(detach instanceof HTMLButtonElement, 'the detach control renders inside the Settings header');
  assert.equal(harness.root.querySelector('.image-trail-panel__settings-section')?.contains(detach), true);

  detach.click();
  assert.deepEqual(harness.actions, [{ name: 'section/detach', sectionId: 'settings' }]);
});

test('detached Settings renders a placeholder and a wider window only while Settings is open', () => {
  const harness = createHarness();
  harness.render(panelState({ settingsOpen: true, detachedSections: ['settings'] }));

  assert.equal(harness.root.querySelector('.image-trail-panel__settings-section'), null, 'Settings leaves the panel root');
  assert.ok(harness.root.querySelector('[data-image-trail-detached-placeholder="settings"]'), 'a placeholder holds the Settings slot');
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="settings"]');
  assert.ok(windowEl, 'the Settings window renders while Settings is open');
  assert.equal(windowEl.getAttribute('aria-label'), 'Settings (detached)');
  assert.ok(windowEl.querySelector('.image-trail-panel__settings-section'), 'the window hosts the Settings content');
  assert.equal(windowEl.style.width, '420px', 'Settings gets the wider window default');

  harness.render(panelState({ settingsOpen: false, detachedSections: ['settings'] }));

  assert.equal(harness.root.querySelector('[data-image-trail-detached-placeholder="settings"]'), null, 'no placeholder while closed');
  assert.equal(harness.detachedRoot.querySelector('[data-image-trail-detached-window="settings"]'), null, 'no window while closed');
});

test('a settings change dispatched from the detached window routes through the normal settings actions', () => {
  const harness = createHarness();
  harness.render(panelState({ settingsOpen: true, detachedSections: ['settings'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="settings"]');
  assert.ok(windowEl);
  const checkbox = windowEl.querySelector<HTMLInputElement>('.image-trail-panel__settings-checkbox input[type="checkbox"]');
  assert.ok(checkbox instanceof HTMLInputElement, 'a settings checkbox renders inside the window');

  checkbox.click();

  assert.equal(harness.actions.length, 1);
  const action = harness.actions[0] as { name: string };
  assert.match(action.name, /^settings\//, 'the change dispatches a normal settings action');
});

test('Escape originating in an editable control does not restore the window', () => {
  const harness = createHarness();
  harness.render(panelState({ settingsOpen: true, detachedSections: ['settings'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="settings"]');
  assert.ok(windowEl);
  const input = windowEl.querySelector<HTMLInputElement>('input');
  assert.ok(input instanceof HTMLInputElement, 'the Settings window contains an input');

  const escapeFromInput = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  input.dispatchEvent(escapeFromInput);

  assert.equal(escapeFromInput.defaultPrevented, false, 'the window leaves Escape to the editable control');
  assert.deepEqual(harness.actions, [], 'no restore dispatches from an editable control');

  windowEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.deepEqual(harness.actions, [{ name: 'section/restore', sectionId: 'settings' }]);
});

test('the history section header renders a keyboard-accessible detach control that dispatches section/detach', () => {
  const harness = createHarness();
  harness.render(panelState());

  const detach = harness.root.querySelector<HTMLButtonElement>('[data-image-trail-detach="history"]');
  assert.ok(detach instanceof HTMLButtonElement, 'the detach control renders inside the history section');
  assert.equal(detach.getAttribute('aria-label'), 'Detach Recent history into a floating window');
  assert.equal(harness.root.querySelector('.image-trail-panel__history-section')?.contains(detach), true);

  detach.click();
  assert.deepEqual(harness.actions, [{ name: 'section/detach', sectionId: 'history' }]);
});

test('a detached history section renders a placeholder in the panel and a dialog window with the section content', () => {
  const harness = createHarness();
  harness.render(panelState({ detachedSections: ['history'] }));

  assert.equal(harness.root.querySelector('.image-trail-panel__history-section'), null, 'the section leaves the panel root');
  const placeholder = harness.root.querySelector<HTMLElement>('[data-image-trail-detached-placeholder="history"]');
  assert.ok(placeholder, 'a placeholder holds the section slot in the panel');

  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl, 'the floating window renders into the detached root');
  assert.equal(windowEl.getAttribute('role'), 'dialog');
  assert.equal(windowEl.getAttribute('aria-label'), 'Recent history (detached)');
  assert.ok(windowEl.querySelector('.image-trail-panel__history-section'), 'the window hosts the section content');
  assert.ok(windowEl.querySelector(`[data-image-trail-row-id="${record.id}"]`), 'the detached section still renders its records');
  assert.equal(windowEl.querySelector('[data-image-trail-detach="history"]'), null, 'no detach control inside the window');
});

test('the placeholder restore button dispatches section/restore', () => {
  const harness = createHarness();
  harness.render(panelState({ detachedSections: ['history'] }));

  const restore = harness.root.querySelector<HTMLButtonElement>('[data-image-trail-detached-placeholder="history"] button');
  assert.ok(restore instanceof HTMLButtonElement);
  restore.click();

  assert.deepEqual(harness.actions, [{ name: 'section/restore', sectionId: 'history' }]);
});

test('Escape restores even from row action buttons that stop keydown propagation', () => {
  const harness = createHarness();
  harness.render(panelState({ detachedSections: ['history'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl);
  const rowAction = windowEl.querySelector<HTMLButtonElement>('.image-trail-panel__item-actions button');
  assert.ok(rowAction instanceof HTMLButtonElement, 'expected a row action button inside the detached window');

  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  rowAction.dispatchEvent(escape);

  assert.equal(escape.defaultPrevented, true);
  assert.deepEqual(harness.actions, [{ name: 'section/restore', sectionId: 'history' }]);
});

test('the window restore button and Escape both dispatch section/restore', () => {
  const harness = createHarness();
  harness.render(panelState({ detachedSections: ['history'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl);

  const restore = windowEl.querySelector<HTMLButtonElement>('[data-image-trail-restore="history"]');
  assert.ok(restore instanceof HTMLButtonElement);
  restore.click();

  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  windowEl.dispatchEvent(escape);

  assert.equal(escape.defaultPrevented, true);
  assert.deepEqual(harness.actions, [
    { name: 'section/restore', sectionId: 'history' },
    { name: 'section/restore', sectionId: 'history' },
  ]);
});

test('a stored window position is applied on render and the list scroll survives a rerender', () => {
  const harness = createHarness();
  harness.layoutState.detachedWindowPositions.set('history', { left: 200, top: 80 });
  harness.render(panelState({ detachedSections: ['history'] }));

  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl);
  assert.equal(windowEl.style.left, '200px');
  assert.equal(windowEl.style.top, '80px');

  const list = windowEl.querySelector<HTMLElement>('.image-trail-panel__record-list');
  assert.ok(list, 'the detached history list renders');
  list.scrollTop = 42;

  harness.render(panelState({ detachedSections: ['history'] }));
  const nextList = harness.detachedRoot.querySelector<HTMLElement>('.image-trail-panel__record-list');
  assert.ok(nextList);
  assert.equal(nextList.scrollTop, 42, 'list scroll is preserved across the detached rerender');
});

test('dragging the window title updates the position and stores it in layout state', () => {
  const harness = createHarness();
  harness.render(panelState({ detachedSections: ['history'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl);
  const title = windowEl.querySelector<HTMLElement>('.image-trail-panel__detached-title');
  assert.ok(title);
  (title as HTMLElement & { setPointerCapture(id: number): void }).setPointerCapture = () => {};
  (title as HTMLElement & { releasePointerCapture(id: number): void }).releasePointerCapture = () => {};

  title.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 20, clientY: 20, bubbles: true, cancelable: true }));
  title.dispatchEvent(new MouseEvent('pointermove', { clientX: 220, clientY: 120, bubbles: true }));
  title.dispatchEvent(new MouseEvent('pointerup', { clientX: 220, clientY: 120, bubbles: true }));

  assert.equal(windowEl.style.left, '200px', 'the window follows the drag');
  assert.equal(windowEl.style.top, '100px');
  assert.deepEqual(harness.layoutState.detachedWindowPositions.get('history'), { left: 200, top: 100 });
});

test('the minimize control collapses the window, updates aria-expanded, and records layout state', () => {
  const harness = createHarness();
  harness.render(panelState({ detachedSections: ['history'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl);
  const minimize = windowEl.querySelector<HTMLButtonElement>('[data-image-trail-minimize="history"]');
  assert.ok(minimize instanceof HTMLButtonElement, 'the window header renders a minimize control');
  assert.equal(minimize.getAttribute('aria-expanded'), 'true');

  minimize.click();

  assert.equal(windowEl.classList.contains('is-minimized'), true);
  assert.equal(minimize.getAttribute('aria-expanded'), 'false');
  assert.equal(harness.layoutState.detachedWindowMinimized.has('history'), true);
  assert.deepEqual(harness.actions, [], 'minimize is layout state only — no panel action dispatches');

  minimize.click();

  assert.equal(windowEl.classList.contains('is-minimized'), false);
  assert.equal(minimize.getAttribute('aria-expanded'), 'true');
  assert.equal(harness.layoutState.detachedWindowMinimized.has('history'), false);
});

test('a minimized window stays minimized across rerenders and Escape still restores it', () => {
  const harness = createHarness();
  harness.layoutState.detachedWindowMinimized.add('history');
  harness.render(panelState({ detachedSections: ['history'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl);
  assert.equal(windowEl.classList.contains('is-minimized'), true, 'layout state re-applies the minimized window');

  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  windowEl.dispatchEvent(escape);

  assert.deepEqual(harness.actions, [{ name: 'section/restore', sectionId: 'history' }]);
});

test('restoring a section clears its minimized flag so the next detach opens expanded', () => {
  const harness = createHarness();
  harness.render(panelState({ detachedSections: ['history'] }));
  const minimize = harness.detachedRoot.querySelector<HTMLButtonElement>('[data-image-trail-minimize="history"]');
  assert.ok(minimize instanceof HTMLButtonElement);
  minimize.click();
  assert.equal(harness.layoutState.detachedWindowMinimized.has('history'), true);

  harness.render(panelState());

  assert.equal(harness.layoutState.detachedWindowMinimized.has('history'), false, 'restore prunes the minimized flag');

  harness.render(panelState({ detachedSections: ['history'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl);
  assert.equal(windowEl.classList.contains('is-minimized'), false, 're-detaching opens the window expanded');
});

test('minimizing the panel clears the detached root', () => {
  const harness = createHarness();
  harness.render(panelState({ detachedSections: ['history'] }));
  assert.ok(harness.detachedRoot.querySelector('[data-image-trail-detached-window="history"]'));

  harness.render(panelState({ detachedSections: ['history'], minimized: true }));

  assert.equal(harness.detachedRoot.childElementCount, 0);
});
