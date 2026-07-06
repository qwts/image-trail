import test from 'node:test';
import assert from 'node:assert/strict';

import { createHistoryView } from '../../extension/src/ui/components/history-view.js';
import { resetPreviewRowClickTracking } from '../../extension/src/ui/components/record-row-preview-click.js';
import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';

const record: ImageDisplayRecord = {
  id: 'recent-1',
  url: 'https://images.example.test/recent/photo_0042.jpg',
  timestamp: '2026-06-25T15:30:00.000Z',
  source: 'history',
};

function buildHistoryView(
  actions: unknown[],
  selectedIds: readonly string[] = [],
  items: readonly ImageDisplayRecord[] = [record],
  sectionOpen = true,
): HTMLElement {
  return createHistoryView(items, selectedIds, false, true, (action) => actions.push(action), {
    blobKeyAvailable: true,
    sectionOpen,
    listBlockSize: null,
    onListResize: () => undefined,
  });
}

function rowFor(view: HTMLElement, id: string): HTMLElement {
  const row = Array.from(view.querySelectorAll<HTMLElement>('[data-image-trail-row-id]')).find(
    (candidate) => candidate.dataset['imageTrailRowId'] === id,
  );
  assert.ok(row, `expected a recent row for record "${id}"`);
  return row;
}

test('a plain click selects an unselected recent row without previewing it', () => {
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const view = buildHistoryView(actions);
  const row = rowFor(view, 'recent-1');

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [{ name: 'history-selection/select', ids: ['recent-1'] }]);
});

test('a plain click restores recent row focus inside a shadow root', async () => {
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const view = buildHistoryView(actions);
  root.append(view);
  document.body.append(host);
  const row = rowFor(view, 'recent-1');

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await Promise.resolve();

  assert.equal(root.activeElement, row);
});

test('a double-click on a selected recent row previews it (#426)', () => {
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const view = buildHistoryView(actions, ['recent-1']);
  const row = rowFor(view, 'recent-1');

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [
    { name: 'history-selection/select', ids: ['recent-1'] },
    { name: 'capture/preview', url: record.url, blobId: undefined },
  ]);
});

test('a stale second click on a selected recent row re-selects instead of previewing (#426)', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const view = buildHistoryView(actions, ['recent-1']);
  const row = rowFor(view, 'recent-1');

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  t.mock.timers.tick(501);
  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  // Two clicks beyond the double-click window are two selections — never a surprise projection.
  assert.deepEqual(actions, [
    { name: 'history-selection/select', ids: ['recent-1'] },
    { name: 'history-selection/select', ids: ['recent-1'] },
  ]);
});

test('a ctrl-click toggles recent selection without previewing', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions);
  const row = rowFor(view, 'recent-1');

  row.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [{ name: 'history-selection/toggle', id: 'recent-1' }]);
});

test('Enter on a selected recent row previews it', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions, ['recent-1']);
  const row = rowFor(view, 'recent-1');

  const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
  row.dispatchEvent(enter);

  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(actions, [{ name: 'capture/preview', url: record.url, blobId: undefined }]);
});

test('Enter on an unselected recent row previews it', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions);
  const row = rowFor(view, 'recent-1');

  const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
  row.dispatchEvent(enter);

  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(actions, [{ name: 'capture/preview', url: record.url, blobId: undefined }]);
});

test('Space on an unselected recent row still selects it', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions);
  const row = rowFor(view, 'recent-1');

  const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true });
  row.dispatchEvent(space);

  assert.equal(space.defaultPrevented, true);
  assert.deepEqual(actions, [{ name: 'history-selection/select', ids: ['recent-1'] }]);
});

test('ArrowDown moves recent row single selection to the next row', () => {
  const actions: unknown[] = [];
  const second = { ...record, id: 'recent-2', url: 'https://images.example.test/recent/photo_0043.jpg' };
  const view = buildHistoryView(actions, ['recent-1'], [record, second]);
  const row = rowFor(view, 'recent-1');

  const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true });
  row.dispatchEvent(arrow);

  assert.equal(arrow.defaultPrevented, true);
  assert.deepEqual(actions, [{ name: 'history-selection/select', ids: ['recent-2'] }]);
});

test('ArrowDown restores recent row focus inside a shadow root', async () => {
  const actions: unknown[] = [];
  const second = { ...record, id: 'recent-2', url: 'https://images.example.test/recent/photo_0043.jpg' };
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const view = buildHistoryView(actions, ['recent-1'], [record, second]);
  root.append(view);
  document.body.append(host);
  const row = rowFor(view, 'recent-1');
  const nextRow = rowFor(view, 'recent-2');

  row.focus();
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true }));
  await Promise.resolve();

  assert.equal(root.activeElement, nextRow);
});

test('stored recent rows render the original indicator', () => {
  const actions: unknown[] = [];
  const captured = {
    ...record,
    captureStatus: 'captured' as const,
    blobId: 'blob-1',
    storedOriginal: {
      blobId: 'blob-1',
      mimeType: 'image/jpeg',
      byteLength: 1024,
      capturedAt: '2026-06-25T15:30:00.000Z',
    },
  };
  const view = buildHistoryView(actions, [], [captured]);
  const row = rowFor(view, 'recent-1');

  assert.ok(row.querySelector('.image-trail-panel__stored-original-dot'));
});

test('the recents toolbar renders inside the section header row (#430)', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions);
  const toolbar = view.querySelector('.image-trail-panel__section-header--with-actions .image-trail-panel__history-toolbar');
  assert.ok(toolbar, 'the toolbar lives in the header row, not on a floating row below it');
});

test('the heading toggle collapses and expands the recents section (#438)', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions);
  const toggle = view.querySelector<HTMLElement>('.image-trail-panel__section-header--collapsible');
  assert.ok(toggle);
  assert.equal(toggle.getAttribute('role'), 'button');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), 'Hide the Recent history list', 'the accessible name carries the action');

  // Summary ergonomics (#441): the whole header row toggles — a click on the row itself counts.
  toggle.click();
  assert.deepEqual(actions, [{ name: 'panel/history-section-open', open: false }]);
});

test('a collapsed recents section keeps its header actions but hides the list (#438)', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions, [], [record], false);
  assert.equal(view.querySelector('.image-trail-panel__record-list'), null, 'the list is hidden while collapsed');
  const selectAll = [...view.querySelectorAll('button')].find((button) => button.textContent === 'Select all recents');
  assert.ok(selectAll, 'the header toolbar stays usable while collapsed');

  // Toolbar clicks are plain sibling buttons — they must never toggle the collapse.
  selectAll.click();
  assert.deepEqual(actions, [{ name: 'history-selection/select', ids: [record.id] }]);
});
