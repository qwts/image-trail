import test from 'node:test';
import { resetPreviewRowClickTracking } from '../../extension/src/ui/components/record-row-preview-click.js';
import assert from 'node:assert/strict';

import { createRecallDrawerView } from '../../extension/src/ui/components/recall-drawer-view.js';
import { renderRecallDrawer, type PanelRenderTarget } from '../../extension/src/ui/render.js';
import { createInitialPanelState, EMPTY_RECALL_STATE } from '../../extension/src/core/state.js';
import type { RecallCandidate } from '../../extension/src/core/types.js';

const record: RecallCandidate = {
  id: 'recall-1',
  url: 'https://images.example.test/recall/photo_0042.jpg',
  timestamp: '2026-06-25T15:30:00.000Z',
  source: 'bookmark',
  envelopeCreatedAt: '2026-06-25T15:30:00.000Z',
};

const geometry = {
  side: 'right' as const,
  inlineStart: 0,
  inlineSize: 320,
  blockStart: 0,
  blockSize: 480,
};

function buildRecallView(
  actions: unknown[],
  selectedIds: readonly string[] = [],
  candidates: readonly RecallCandidate[] = [record],
): HTMLElement {
  return createRecallDrawerView(
    {
      open: true,
      busy: false,
      side: 'right',
      candidates,
      selectedIds,
      offset: 0,
      nextOffset: candidates.length,
      hasMore: false,
      total: candidates.length,
      failedCount: 0,
    },
    geometry,
    (action) => actions.push(action),
  );
}

function rowFor(view: HTMLElement, id: string): HTMLElement {
  const row = Array.from(view.querySelectorAll<HTMLElement>('[data-image-trail-row-id]')).find(
    (candidate) => candidate.dataset['imageTrailRowId'] === id,
  );
  assert.ok(row, `expected a Recall row for record "${id}"`);
  return row;
}

test('a plain click selects an unselected Recall row without previewing it', () => {
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const view = buildRecallView(actions);
  const row = rowFor(view, 'recall-1');

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [{ name: 'recall-selection/select', ids: ['recall-1'] }]);
});

test('a double-click on a selected Recall row previews it (#426)', () => {
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const view = buildRecallView(actions, ['recall-1']);
  const row = rowFor(view, 'recall-1');

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [
    { name: 'recall-selection/select', ids: ['recall-1'] },
    { name: 'capture/preview', url: record.url, blobId: undefined, scrollAnchorId: 'recall-1' },
  ]);
});

test('a stale second click on a selected Recall row re-selects instead of previewing (#426)', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const view = buildRecallView(actions, ['recall-1']);
  const row = rowFor(view, 'recall-1');

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  t.mock.timers.tick(501);
  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [
    { name: 'recall-selection/select', ids: ['recall-1'] },
    { name: 'recall-selection/select', ids: ['recall-1'] },
  ]);
});

test('Enter on a selected Recall row previews it', () => {
  const actions: unknown[] = [];
  const view = buildRecallView(actions, ['recall-1']);
  const row = rowFor(view, 'recall-1');

  const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
  row.dispatchEvent(enter);

  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(actions, [{ name: 'capture/preview', url: record.url, blobId: undefined, scrollAnchorId: 'recall-1' }]);
});

test('ctrl-click and checkbox clicks keep Recall multi-select behavior', () => {
  const actions: unknown[] = [];
  const view = buildRecallView(actions);
  const row = rowFor(view, 'recall-1');
  const checkbox = row.querySelector('input');
  assert.ok(checkbox instanceof HTMLInputElement);

  row.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true }));
  checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [
    { name: 'recall-selection/toggle', id: 'recall-1' },
    { name: 'recall-selection/toggle', id: 'recall-1' },
  ]);
});

test('ArrowDown moves Recall single selection to the next row', () => {
  const actions: unknown[] = [];
  const second = { ...record, id: 'recall-2', url: 'https://images.example.test/recall/photo_0043.jpg' };
  const view = buildRecallView(actions, ['recall-1'], [record, second]);
  const row = rowFor(view, 'recall-1');

  const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true });
  row.dispatchEvent(arrow);

  assert.equal(arrow.defaultPrevented, true);
  assert.deepEqual(actions, [{ name: 'recall-selection/select', ids: ['recall-2'] }]);
});

test('ArrowDown restores Recall row focus inside a shadow root', async () => {
  const actions: unknown[] = [];
  const second = { ...record, id: 'recall-2', url: 'https://images.example.test/recall/photo_0043.jpg' };
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const view = buildRecallView(actions, ['recall-1'], [record, second]);
  root.append(view);
  document.body.append(host);
  const row = rowFor(view, 'recall-1');
  const nextRow = rowFor(view, 'recall-2');

  row.focus();
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true }));
  await Promise.resolve();

  assert.equal(root.activeElement, nextRow);
});

test('a viewport narrower than the drawer clamps the inline width inside the edge padding', () => {
  // Regression: the geometry had a 240px width floor, so on viewports narrower than ~264px the
  // inline width overrode the CSS `width: min(340px, calc(100vw - 24px))` and pushed the Close
  // control off-screen. The width must mirror the CSS and never exceed viewport - 2 * 12px padding.
  const happyDOM = (window as unknown as { happyDOM: { setViewport(viewport: { width?: number; height?: number }): void } }).happyDOM;
  const root = document.createElement('div');
  const recallRoot = document.createElement('div');
  document.body.append(root, recallRoot);
  // happy-dom elements report a zero rect; pin a realistic panel rect so the drawer takes the
  // clamped-inside-the-viewport path rather than the beside-the-panel path.
  Object.defineProperty(root, 'getBoundingClientRect', {
    value: () => ({ left: 12, right: 100, top: 40, bottom: 400, width: 88, height: 360 }),
  });
  happyDOM.setViewport({ width: 200, height: 480 });
  try {
    const target: PanelRenderTarget = {
      root,
      recallRoot,
      dispatch: () => {},
      layoutState: {
        fieldsPanelOpen: false,
        fieldsPanelBlockSize: null,
        historyListBlockSize: null,
        fieldDisplayModes: new Map(),
        detachedWindowPositions: new Map(),
        detachedWindowMinimized: new Set(),
        collapsibleListScrollTops: new Map(),
      },
    };
    const state = {
      ...createInitialPanelState(0),
      recall: { ...EMPTY_RECALL_STATE, open: true, candidates: [record], total: 1, nextOffset: 1 },
    };

    renderRecallDrawer(target, state);

    const drawer = recallRoot.querySelector<HTMLElement>('.image-trail-panel__recall-drawer');
    assert.ok(drawer, 'the recall drawer renders');
    const width = Number.parseFloat(drawer.style.width);
    const left = Number.parseFloat(drawer.style.left);
    assert.equal(width, 200 - 24, 'the inline width mirrors the CSS min(340px, 100vw - 24px)');
    assert.ok(left >= 12, `the drawer starts inside the left edge padding (left=${left})`);
    assert.ok(left + width <= 200 - 12, `the drawer ends inside the right edge padding (left=${left}, width=${width})`);
  } finally {
    happyDOM.setViewport({ width: 1024, height: 768 });
    root.remove();
    recallRoot.remove();
  }
});

test('Recall rows render thumbnail images when available', () => {
  const actions: unknown[] = [];
  const thumbnail = 'data:image/png;base64,abc';
  const view = buildRecallView(actions, [], [{ ...record, thumbnail }]);
  const row = rowFor(view, 'recall-1');
  const image = row.querySelector('img');

  assert.ok(image instanceof HTMLImageElement);
  assert.equal(image.src, thumbnail);
});
