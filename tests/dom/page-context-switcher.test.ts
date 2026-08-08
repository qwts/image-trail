import test from 'node:test';
import assert from 'node:assert/strict';

import type { PanelAction, TargetState } from '../../extension/src/core/types.js';
import { renderPageContextSwitcher } from '../../extension/src/ui/react/page-context-switcher.js';
import { unmountReactSubtree } from '../../extension/src/ui/react/react-subtree.js';
import { createTargetPickerView } from '../../extension/src/ui/react/target-picker-view.js';

test('renders capability-aware context overrides and an explicit automatic reset', () => {
  const root = document.createElement('div');
  const actions: PanelAction[] = [];
  renderPageContextSwitcher(
    root,
    {
      detected: 'feed',
      effective: 'gallery',
      override: 'gallery',
      available: ['single', 'gallery', 'feed'],
      imageCount: 6,
    },
    (action) => actions.push(action),
  );
  assert.equal(root.querySelector('[aria-live="polite"] span')?.textContent, 'Override · Gallery page · detected Feed');
  assert.equal(root.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.textContent, 'Gallery page');

  root.querySelector<HTMLButtonElement>('button[title="Use Feed context"]')?.click();
  root.querySelector<HTMLButtonElement>('.image-trail-page-context__reset')?.click();
  assert.deepEqual(actions, [
    { name: 'page-context/set', context: 'feed' },
    { name: 'page-context/set', context: null },
  ]);
  unmountReactSubtree(root);
});

test('disables unsupported contexts and reports a stale saved override as inactive', () => {
  const root = document.createElement('div');
  renderPageContextSwitcher(
    root,
    { detected: 'single', effective: 'single', override: 'feed', available: ['single'], imageCount: 1 },
    () => undefined,
  );
  assert.equal(root.querySelector<HTMLButtonElement>('button[title^="Gallery page"]')?.disabled, true);
  assert.equal(root.querySelector<HTMLButtonElement>('button[title^="Feed"]')?.disabled, true);
  assert.equal(root.querySelector('[aria-live="polite"] span')?.textContent, 'Saved override unavailable · Automatic Single image');
  unmountReactSubtree(root);
});

test('preserves the zero-image target count before a qualifying image exists', () => {
  const target: TargetState = {
    mode: 'auto',
    picking: false,
    grabModeActive: false,
    candidateCount: 0,
    selectedUrl: null,
    selectedHandleId: null,
    selectedDimensions: null,
    fillScreen: false,
    objectFit: 'contain',
    message: '',
  };
  const root = createTargetPickerView(target, () => undefined, {
    pageContext: { detected: 'single', effective: 'single', override: null, available: [], imageCount: 0 },
  });
  assert.equal(root.querySelector('.image-trail-panel__target-count')?.textContent, '0 on page');
  unmountReactSubtree(root);
});

test('Host target uses the shared explicit Hide/Show header control (#755)', async () => {
  const openChanges: boolean[] = [];
  const target: TargetState = {
    mode: 'auto',
    picking: false,
    grabModeActive: false,
    candidateCount: 1,
    selectedUrl: null,
    selectedHandleId: null,
    selectedDimensions: null,
    fillScreen: false,
    objectFit: 'contain',
    message: '',
  };
  const root = createTargetPickerView(target, () => undefined, {
    open: false,
    onOpenChange: (open) => openChanges.push(open),
  });
  const toggle = root.querySelector<HTMLButtonElement>('.image-trail-ds__section-toggle');
  const card = root.querySelector<HTMLElement>('.image-trail-panel__target-card');
  assert.ok(toggle && card);
  assert.equal(toggle.textContent, 'Show');
  assert.equal(card.hidden, true);

  toggle.click();
  await Promise.resolve();
  assert.equal(toggle.textContent, 'Hide');
  assert.equal(card.hidden, false);
  assert.deepEqual(openChanges, [true]);
  unmountReactSubtree(root);
});

test('Host target can be collapsed even while target selection needs attention', async () => {
  const baseTarget: TargetState = {
    mode: 'auto',
    picking: false,
    grabModeActive: false,
    candidateCount: 1,
    selectedUrl: null,
    selectedHandleId: null,
    selectedDimensions: null,
    fillScreen: false,
    objectFit: 'contain',
    message: '',
  };

  for (const target of [
    { ...baseTarget, picking: true },
    { ...baseTarget, grabModeActive: true },
    { ...baseTarget, mode: 'manual' as const },
    { ...baseTarget, candidateCount: 2 },
  ]) {
    const openChanges: boolean[] = [];
    const root = createTargetPickerView(target, () => undefined, {
      open: false,
      onOpenChange: (open) => openChanges.push(open),
    });
    const toggle = root.querySelector<HTMLButtonElement>('.image-trail-ds__section-toggle');
    const card = root.querySelector<HTMLElement>('.image-trail-panel__target-card');
    assert.ok(toggle && card);
    // Needs-attention forces initial open even when open:false was requested
    assert.equal(toggle.textContent, 'Hide');
    assert.equal(card.hidden, false);

    toggle.click();
    await Promise.resolve();
    // User can now collapse even when selection needs attention
    assert.equal(toggle.textContent, 'Show');
    assert.equal(card.hidden, true);
    assert.deepEqual(openChanges, [false]);
    unmountReactSubtree(root);
  }
});

test('restores Host fit focus after a native change replaces the React subtree', async () => {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const views: HTMLElement[] = [];
  let target: TargetState = {
    mode: 'auto',
    picking: false,
    grabModeActive: false,
    candidateCount: 1,
    selectedUrl: 'https://images.example.test/a/1.jpg',
    selectedHandleId: 'target-1',
    selectedDimensions: '1200 × 800',
    fillScreen: false,
    objectFit: 'contain',
    message: '',
  };
  const dispatch = (action: PanelAction): void => {
    if (action.name !== 'target/set-object-fit') return;
    target = { ...target, objectFit: action.mode };
    const replacement = createTargetPickerView(target, dispatch);
    views.push(replacement);
    shadow.replaceChildren(replacement);
  };
  const initial = createTargetPickerView(target, dispatch);
  views.push(initial);
  shadow.append(initial);
  const select = shadow.querySelector<HTMLSelectElement>('.image-trail-panel__target-fit-select');
  assert.ok(select);
  select.focus();
  select.value = 'cover';
  select.dispatchEvent(new Event('change', { bubbles: true }));

  document.body.tabIndex = -1;
  document.body.focus();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  const replacement = shadow.querySelector<HTMLSelectElement>('.image-trail-panel__target-fit-select');
  assert.ok(replacement);
  assert.equal(shadow.activeElement, replacement);
  for (const view of views) unmountReactSubtree(view);
  host.remove();
  document.body.removeAttribute('tabindex');
});

test('Host fit focus recovery does not steal a deliberate newer focus target', async () => {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const views: HTMLElement[] = [];
  let target: TargetState = {
    mode: 'auto',
    picking: false,
    grabModeActive: false,
    candidateCount: 1,
    selectedUrl: 'https://images.example.test/a/1.jpg',
    selectedHandleId: 'target-1',
    selectedDimensions: '1200 × 800',
    fillScreen: false,
    objectFit: 'contain',
    message: '',
  };
  const dispatch = (action: PanelAction): void => {
    if (action.name !== 'target/set-object-fit') return;
    target = { ...target, objectFit: action.mode };
    const replacement = createTargetPickerView(target, dispatch);
    views.push(replacement);
    shadow.replaceChildren(replacement);
  };
  const initial = createTargetPickerView(target, dispatch);
  views.push(initial);
  shadow.append(initial);
  const select = shadow.querySelector<HTMLSelectElement>('.image-trail-panel__target-fit-select');
  assert.ok(select);
  select.focus();
  select.value = 'cover';
  select.dispatchEvent(new Event('change', { bubbles: true }));

  const release = shadow.querySelector<HTMLButtonElement>('button');
  assert.ok(release);
  release.focus();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  assert.equal(shadow.activeElement, release);
  for (const view of views) unmountReactSubtree(view);
  host.remove();
});
