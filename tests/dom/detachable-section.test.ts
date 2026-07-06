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

const REGISTRY_EXPECTATIONS: readonly {
  readonly id: string;
  readonly title: string;
  readonly contentClass: string;
  readonly overrides?: Partial<PanelState>;
}[] = [
  { id: 'settings', title: 'Settings', contentClass: 'image-trail-panel__settings-section', overrides: { settingsOpen: true } },
  { id: 'url-editor', title: 'URL editor', contentClass: 'image-trail-panel__url-editor' },
  { id: 'target', title: 'Host target', contentClass: 'image-trail-panel__target-utility' },
  { id: 'fields', title: 'Parsed fields', contentClass: 'image-trail-panel__fields' },
  { id: 'controls', title: 'Manual controls', contentClass: 'image-trail-panel__secondary-controls' },
  { id: 'history', title: 'Recent history', contentClass: 'image-trail-panel__history-section' },
  { id: 'bookmarks', title: 'Queue', contentClass: 'image-trail-panel__bookmarks-section' },
];

for (const entry of REGISTRY_EXPECTATIONS) {
  test(`registry: ${entry.id} renders a detach control attached, and a placeholder + window while detached`, () => {
    const attached = createHarness();
    attached.render(panelState(entry.overrides));
    const control = attached.root.querySelector<HTMLButtonElement>(`[data-image-trail-detach="${entry.id}"]`);
    assert.ok(control instanceof HTMLButtonElement, `${entry.id} gets a detach control with no per-section wiring`);
    assert.equal(attached.root.querySelector(`.${entry.contentClass}`)?.contains(control), true, 'the control sits inside the section');
    control.click();
    assert.deepEqual(attached.actions, [{ name: 'section/detach', sectionId: entry.id }]);

    const detached = createHarness();
    detached.render(panelState({ ...entry.overrides, detachedSections: [entry.id as PanelState['detachedSections'][number]] }));
    assert.equal(detached.root.querySelector(`.${entry.contentClass}`), null, 'the section leaves the panel root');
    assert.ok(detached.root.querySelector(`[data-image-trail-detached-placeholder="${entry.id}"]`), 'a placeholder holds its slot');
    const windowEl = detached.detachedRoot.querySelector<HTMLElement>(`[data-image-trail-detached-window="${entry.id}"]`);
    assert.ok(windowEl, 'the floating window renders');
    assert.equal(windowEl.getAttribute('aria-label'), `${entry.title} (detached)`);
    assert.ok(windowEl.querySelector(`.${entry.contentClass}`), 'the window hosts the section content');
  });
}

test('dragging a section by its heading detaches it at the drop position', () => {
  const harness = createHarness();
  harness.render(panelState());
  const section = harness.root.querySelector<HTMLElement>('.image-trail-panel__history-section');
  assert.ok(section);
  (section as HTMLElement & { setPointerCapture(id: number): void }).setPointerCapture = () => {};
  (section as HTMLElement & { releasePointerCapture(id: number): void }).releasePointerCapture = () => {};
  const heading = section.querySelector<HTMLElement>('.image-trail-panel__section-header h3');
  assert.ok(heading, 'the section heading is the natural grab area');

  heading.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 60, clientY: 60, bubbles: true, cancelable: true }));
  section.dispatchEvent(new MouseEvent('pointermove', { clientX: 320, clientY: 240, bubbles: true }));
  section.dispatchEvent(new MouseEvent('pointerup', { clientX: 320, clientY: 240, bubbles: true }));

  assert.deepEqual(harness.actions, [{ name: 'section/detach', sectionId: 'history' }]);
  assert.deepEqual(harness.layoutState.detachedWindowPositions.get('history'), { left: 296, top: 228 });
  assert.equal(document.querySelector('.image-trail-panel__detach-ghost'), null, 'the ghost is removed');
});

test('a surface drag starting on an interactive control never detaches', () => {
  const harness = createHarness();
  harness.render(panelState());
  const toolbarButton = harness.root.querySelector<HTMLButtonElement>('.image-trail-panel__history-toolbar button');
  assert.ok(toolbarButton instanceof HTMLButtonElement);

  toolbarButton.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 60, clientY: 60, bubbles: true, cancelable: true }));
  toolbarButton.dispatchEvent(new MouseEvent('pointermove', { clientX: 320, clientY: 240, bubbles: true }));
  toolbarButton.dispatchEvent(new MouseEvent('pointerup', { clientX: 320, clientY: 240, bubbles: true }));

  assert.deepEqual(harness.actions, [], 'buttons and other controls are not drag-out origins');
});

test('summary-backed sections drag out by their header, and an engaged drag suppresses the details toggle', () => {
  const harness = createHarness();
  harness.render(panelState());
  const section = harness.root.querySelector<HTMLElement>('.image-trail-panel__target-utility');
  assert.ok(section);
  (section as HTMLElement & { setPointerCapture(id: number): void }).setPointerCapture = () => {};
  (section as HTMLElement & { releasePointerCapture(id: number): void }).releasePointerCapture = () => {};
  const summary = section.querySelector<HTMLElement>('.image-trail-panel__target-summary');
  assert.ok(summary, 'Host target keeps its summary header');

  summary.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 60, clientY: 60, bubbles: true, cancelable: true }));
  section.dispatchEvent(new MouseEvent('pointermove', { clientX: 260, clientY: 200, bubbles: true }));
  section.dispatchEvent(new MouseEvent('pointerup', { clientX: 260, clientY: 200, bubbles: true }));

  assert.deepEqual(harness.actions, [{ name: 'section/detach', sectionId: 'target' }], 'the summary header is a drag-out source');
  assert.deepEqual(harness.layoutState.detachedWindowPositions.get('target'), { left: 236, top: 188 });

  const trailingClick = new MouseEvent('click', { bubbles: true, cancelable: true });
  summary.dispatchEvent(trailingClick);
  assert.equal(trailingClick.defaultPrevented, true, 'the trailing click cannot toggle the details group');
});

test('summary-backed sections keep detach controls beside the Show/Hide tail', () => {
  const harness = createHarness();
  harness.render(panelState());

  for (const selector of ['.image-trail-panel__target-summary', '.image-trail-panel__secondary-controls-summary']) {
    const summary = harness.root.querySelector<HTMLElement>(selector);
    assert.ok(summary, `expected ${selector}`);
    assert.equal(summary.classList.contains('image-trail-panel__summary-has-detach-control'), true);
    assert.equal(summary.style.getPropertyValue('--image-trail-summary-tail-margin'), '8px');
    assert.ok(summary.lastElementChild instanceof HTMLButtonElement, `${selector} keeps the detach button as the last real element`);
    assert.equal(summary.lastElementChild.matches('[data-image-trail-detach]'), true);
  }
});

test('a sub-threshold press on a summary leaves the details toggle untouched', () => {
  const harness = createHarness();
  harness.render(panelState());
  const section = harness.root.querySelector<HTMLElement>('.image-trail-panel__target-utility');
  assert.ok(section);
  const summary = section.querySelector<HTMLElement>('.image-trail-panel__target-summary');
  assert.ok(summary);

  summary.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 60, clientY: 60, bubbles: true, cancelable: true }));
  summary.dispatchEvent(new MouseEvent('pointerup', { clientX: 61, clientY: 60, bubbles: true }));
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  summary.dispatchEvent(click);

  assert.equal(click.defaultPrevented, false, 'ordinary summary clicks keep toggling the group');
  assert.deepEqual(harness.actions, [], 'no detach dispatches');
});

test('a pointerdown on a natively resizable surface resizes instead of starting a drag-out', () => {
  const harness = createHarness();
  harness.render(panelState());
  const section = harness.root.querySelector<HTMLElement>('.image-trail-panel__fields');
  assert.ok(section);
  section.style.resize = 'vertical';
  (section as HTMLElement & { setPointerCapture(id: number): void }).setPointerCapture = () => {};

  section.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 60, clientY: 60, bubbles: true, cancelable: true }));
  section.dispatchEvent(new MouseEvent('pointermove', { clientX: 260, clientY: 200, bubbles: true }));
  section.dispatchEvent(new MouseEvent('pointerup', { clientX: 260, clientY: 200, bubbles: true }));

  assert.deepEqual(harness.actions, [], 'the resize corner never starts a drag-out');
});

test('a focused field input in the detached Parsed fields window survives a rerender with value and selection', async () => {
  const harness = createHarness();
  const withTarget = (): PanelState =>
    panelState({
      detachedSections: ['fields'],
      target: { ...createInitialPanelState(0).target, selectedUrl: 'https://images.example.test/a/photo_0042.jpg?page=3' },
    });
  harness.render(withTarget());
  const input = harness.detachedRoot.querySelector<HTMLInputElement>(
    '[data-image-trail-detached-window="fields"] .image-trail-panel__field-input',
  );
  assert.ok(input instanceof HTMLInputElement, 'the detached fields window renders field inputs');
  input.focus();
  input.value = '0777';
  input.setSelectionRange(1, 3);

  harness.render(withTarget());
  // The focus restore lands in a microtask after the render swap.
  await new Promise((resolve) => setTimeout(resolve, 0));

  const restored = harness.detachedRoot.querySelector<HTMLInputElement>(
    '[data-image-trail-detached-window="fields"] .image-trail-panel__field-input',
  );
  assert.ok(restored instanceof HTMLInputElement);
  assert.equal(document.activeElement, restored, 'focus returns to the detached field input');
  assert.equal(restored.value, '0777', 'the in-progress value survives');
  assert.equal(restored.selectionStart, 1);
  assert.equal(restored.selectionEnd, 3);
});

test('Escape cancels an in-progress surface drag without detaching', () => {
  const harness = createHarness();
  harness.render(panelState());
  const section = harness.root.querySelector<HTMLElement>('.image-trail-panel__history-section');
  assert.ok(section);
  (section as HTMLElement & { setPointerCapture(id: number): void }).setPointerCapture = () => {};
  (section as HTMLElement & { releasePointerCapture(id: number): void }).releasePointerCapture = () => {};
  const heading = section.querySelector<HTMLElement>('.image-trail-panel__section-header h3');
  assert.ok(heading);

  heading.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 60, clientY: 60, bubbles: true, cancelable: true }));
  section.dispatchEvent(new MouseEvent('pointermove', { clientX: 320, clientY: 240, bubbles: true }));
  assert.ok(document.querySelector('.image-trail-panel__detach-ghost'), 'the drag engaged');

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

  assert.equal(document.querySelector('.image-trail-panel__detach-ghost'), null, 'the ghost is removed on cancel');
  assert.deepEqual(harness.actions, [], 'a cancelled drag dispatches nothing');
  assert.equal(harness.layoutState.detachedWindowPositions.has('history'), false, 'no position is stored');

  // A later pointerup must not resurrect the drag.
  section.dispatchEvent(new MouseEvent('pointerup', { clientX: 320, clientY: 240, bubbles: true }));
  assert.deepEqual(harness.actions, []);
});

test('Escape reverts an in-progress detached-window drag to its original position', () => {
  const harness = createHarness();
  harness.layoutState.detachedWindowPositions.set('history', { left: 200, top: 80 });
  harness.render(panelState({ detachedSections: ['history'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl);
  const title = windowEl.querySelector<HTMLElement>('.image-trail-panel__detached-title');
  assert.ok(title);
  (title as HTMLElement & { setPointerCapture(id: number): void }).setPointerCapture = () => {};
  (title as HTMLElement & { releasePointerCapture(id: number): void }).releasePointerCapture = () => {};

  title.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 210, clientY: 90, bubbles: true, cancelable: true }));
  title.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 300, bubbles: true }));
  assert.notEqual(windowEl.style.left, '200px', 'the window followed the drag');

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

  assert.equal(windowEl.style.left, '200px', 'Escape reverts the window position');
  assert.equal(windowEl.style.top, '80px');
  assert.deepEqual(harness.layoutState.detachedWindowPositions.get('history'), { left: 200, top: 80 }, 'no new position is stored');
});

test('the Settings header renders a detach control that dispatches section/detach', () => {
  const harness = createHarness();
  harness.render(panelState({ settingsOpen: true }));

  const detach = harness.root.querySelector<HTMLButtonElement>('[data-image-trail-detach="settings"]');
  assert.ok(detach instanceof HTMLButtonElement, 'the detach control renders inside the Settings header');
  assert.equal(harness.root.querySelector('.image-trail-panel__settings-section')?.contains(detach), true);

  detach.click();
  assert.deepEqual(harness.actions, [{ name: 'section/detach', sectionId: 'settings' }]);
});

test('the detached window body scroll survives rerenders (Settings scrolls on the body, not a record list)', () => {
  const harness = createHarness();
  harness.render(panelState({ settingsOpen: true, detachedSections: ['settings'] }));
  const body = harness.detachedRoot.querySelector<HTMLElement>(
    '[data-image-trail-detached-window="settings"] .image-trail-panel__detached-body',
  );
  assert.ok(body, 'the Settings window renders a scrollable body');
  body.scrollTop = 33;

  harness.render(panelState({ settingsOpen: true, detachedSections: ['settings'] }));

  const nextBody = harness.detachedRoot.querySelector<HTMLElement>(
    '[data-image-trail-detached-window="settings"] .image-trail-panel__detached-body',
  );
  assert.ok(nextBody);
  assert.equal(nextBody.scrollTop, 33, 'body scroll is preserved across the detached rerender');
});

test('a hidden detached neighbor does not shift another window’s default stack position', () => {
  const openHarness = createHarness();
  openHarness.render(panelState({ settingsOpen: true, detachedSections: ['settings', 'history'] }));
  const withSettingsVisible = openHarness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(withSettingsVisible);

  const closedHarness = createHarness();
  closedHarness.render(panelState({ settingsOpen: false, detachedSections: ['settings', 'history'] }));
  const withSettingsHidden = closedHarness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(withSettingsHidden, 'the history window renders even while the Settings window is hidden');

  assert.equal(withSettingsHidden.style.left, withSettingsVisible.style.left, 'default left is stable');
  assert.equal(withSettingsHidden.style.top, withSettingsVisible.style.top, 'default top is stable');
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

test('the Queue section detaches like Recent history: control, placeholder, and window content', () => {
  const harness = createHarness();
  harness.render(panelState({ bookmarks: [{ ...record, id: 'queue-1', source: 'bookmark' }], bookmarkTotal: 1 }));

  const detach = harness.root.querySelector<HTMLButtonElement>('[data-image-trail-detach="bookmarks"]');
  assert.ok(detach instanceof HTMLButtonElement, 'the detach control renders inside the Queue header');
  detach.click();
  assert.deepEqual(harness.actions, [{ name: 'section/detach', sectionId: 'bookmarks' }]);

  harness.render(
    panelState({ bookmarks: [{ ...record, id: 'queue-1', source: 'bookmark' }], bookmarkTotal: 1, detachedSections: ['bookmarks'] }),
  );

  assert.equal(harness.root.querySelector('.image-trail-panel__bookmarks-section'), null, 'the Queue section leaves the panel root');
  assert.ok(harness.root.querySelector('[data-image-trail-detached-placeholder="bookmarks"]'));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="bookmarks"]');
  assert.ok(windowEl, 'the Queue window renders into the detached root');
  assert.equal(windowEl.getAttribute('aria-label'), 'Queue (detached)');
  assert.ok(windowEl.querySelector('[data-image-trail-row-id="queue-1"]'), 'the detached Queue still renders its rows');
});

test('dragging the detach control past the threshold detaches at the drop position without double-dispatching', () => {
  const harness = createHarness();
  harness.render(panelState());
  const detach = harness.root.querySelector<HTMLButtonElement>('[data-image-trail-detach="history"]');
  assert.ok(detach instanceof HTMLButtonElement);
  (detach as HTMLButtonElement & { setPointerCapture(id: number): void }).setPointerCapture = () => {};
  (detach as HTMLButtonElement & { releasePointerCapture(id: number): void }).releasePointerCapture = () => {};

  detach.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 40, clientY: 40, bubbles: true, cancelable: true }));
  detach.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 220, bubbles: true }));
  detach.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, clientY: 220, bubbles: true }));
  // Browsers fire a click after pointerup on the same element; the control must swallow it.
  detach.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(harness.actions, [{ name: 'section/detach', sectionId: 'history' }], 'exactly one detach dispatches');
  assert.deepEqual(harness.layoutState.detachedWindowPositions.get('history'), { left: 276, top: 208 });
  assert.equal(document.querySelector('.image-trail-panel__detach-ghost'), null, 'the drop ghost is removed');

  harness.render(panelState({ detachedSections: ['history'] }));
  const windowEl = harness.detachedRoot.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
  assert.ok(windowEl);
  assert.equal(windowEl.style.left, '276px', 'the window opens at the drop position');
  assert.equal(windowEl.style.top, '208px');
});

test('drag-out clamps the drop position against the section’s actual window width', () => {
  const harness = createHarness();
  harness.render(panelState({ settingsOpen: true }));
  const detach = harness.root.querySelector<HTMLButtonElement>('[data-image-trail-detach="settings"]');
  assert.ok(detach instanceof HTMLButtonElement);
  (detach as HTMLButtonElement & { setPointerCapture(id: number): void }).setPointerCapture = () => {};
  (detach as HTMLButtonElement & { releasePointerCapture(id: number): void }).releasePointerCapture = () => {};

  detach.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 40, clientY: 40, bubbles: true, cancelable: true }));
  detach.dispatchEvent(new MouseEvent('pointermove', { clientX: 1000, clientY: 100, bubbles: true }));
  detach.dispatchEvent(new MouseEvent('pointerup', { clientX: 1000, clientY: 100, bubbles: true }));
  detach.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  // viewport 1024 wide; Settings window is 420px → maxLeft = 1024 - 420 - 12 = 592, not the
  // 672 a fixed 340px ghost would have allowed (which renders 80px off-screen).
  assert.deepEqual(harness.layoutState.detachedWindowPositions.get('settings'), { left: 592, top: 88 });
});

test('a sub-threshold press still detaches via the plain click path', () => {
  const harness = createHarness();
  harness.render(panelState());
  const detach = harness.root.querySelector<HTMLButtonElement>('[data-image-trail-detach="history"]');
  assert.ok(detach instanceof HTMLButtonElement);

  detach.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 40, clientY: 40, bubbles: true, cancelable: true }));
  detach.dispatchEvent(new MouseEvent('pointermove', { clientX: 42, clientY: 41, bubbles: true }));
  detach.dispatchEvent(new MouseEvent('pointerup', { clientX: 42, clientY: 41, bubbles: true }));
  detach.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(harness.actions, [{ name: 'section/detach', sectionId: 'history' }]);
  assert.equal(harness.layoutState.detachedWindowPositions.has('history'), false, 'a plain click keeps the default position');
});

test('the history section header renders a keyboard-accessible detach control that dispatches section/detach', () => {
  const harness = createHarness();
  harness.render(panelState());

  const detach = harness.root.querySelector<HTMLButtonElement>('[data-image-trail-detach="history"]');
  assert.ok(detach instanceof HTMLButtonElement, 'the detach control renders inside the history section');
  assert.equal(detach.getAttribute('aria-label'), 'Detach Recent history into a floating window (drag to place)');
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
