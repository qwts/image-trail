import test from 'node:test';
import assert from 'node:assert/strict';

import { createHistoryView } from '../../extension/src/ui/components/history-view.js';
import { resetPreviewRowClickTracking } from '../../extension/src/ui/components/record-row-preview-click.js';
import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import type { RecentSparseRowDisplayMode } from '../../extension/src/core/types.js';

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
  collapsible = true,
  sparseRowDisplayMode: RecentSparseRowDisplayMode = 'adaptive',
  displayOrder?: 'newest-first' | 'oldest-first',
): HTMLElement {
  return createHistoryView(items, selectedIds, false, true, (action) => actions.push(action), {
    blobKeyAvailable: true,
    sectionOpen,
    collapsible,
    listBlockSize: null,
    onListResize: () => undefined,
    sparseRowDisplayMode,
    displayOrder,
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

  assert.ok(row.classList.contains('image-trail-ds__record-row'));
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

test('the Recents sort control stays in the section header while bulk actions render below it (#448)', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions);
  const toolbar = view.querySelector('.image-trail-panel__section-header--with-actions .image-trail-panel__history-toolbar');
  assert.ok(toolbar?.querySelector('select[aria-label="Sort Recents"]'));
  assert.ok(view.querySelector('.image-trail-panel__history-actions'), 'bulk actions stay outside the constrained header grid');
});

test('Recents sort control orders timestamps stably and dispatches its persisted display setting', () => {
  const actions: unknown[] = [];
  const newest = { ...record, id: 'recent-newest', timestamp: '2026-06-26T15:30:00.000Z' };
  const oldest = { ...record, id: 'recent-oldest', timestamp: '2026-06-24T15:30:00.000Z' };
  const view = buildHistoryView(actions, [], [newest, oldest], true, true, 'adaptive', 'oldest-first');
  const rows = Array.from(view.querySelectorAll<HTMLElement>('[data-image-trail-row-id]'));
  assert.deepEqual(
    rows.map((row) => row.dataset['imageTrailRowId']),
    ['recent-oldest', 'recent-newest'],
  );

  const select = view.querySelector<HTMLSelectElement>('select[aria-label="Sort Recents"]');
  assert.ok(select);
  assert.deepEqual(
    Array.from(select.options, (option) => ({ value: option.value, label: option.textContent })),
    [
      { value: 'newest-first', label: 'Newest first' },
      { value: 'oldest-first', label: 'Oldest first' },
    ],
  );
  select.value = 'newest-first';
  select.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [{ name: 'history/update-display-order', order: 'newest-first' }]);
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

test('a collapsed recents section keeps bulk actions but hides the list (#438)', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions, [], [record], false);
  assert.equal(view.querySelector('.image-trail-panel__record-list'), null, 'the list is hidden while collapsed');
  const selectAll = [...view.querySelectorAll('button')].find((button) => button.textContent === 'Select all recents');
  assert.ok(selectAll, 'the bulk-action row stays usable while collapsed');

  // Bulk-action clicks are outside the toggle — they must never toggle the collapse.
  selectAll.click();
  assert.deepEqual(actions, [{ name: 'history-selection/select', ids: [record.id] }]);
});

test('a non-collapsible render (detached window) has no toggle affordance (#441)', () => {
  const actions: unknown[] = [];
  const view = buildHistoryView(actions, [], [record], true, false);
  const header = view.querySelector<HTMLElement>('.image-trail-panel__section-header');
  assert.ok(header);
  assert.equal(header.getAttribute('role'), null, 'no button role in a detached window');
  assert.equal(header.classList.contains('image-trail-panel__section-header--collapsible'), false);

  header.click();
  assert.deepEqual(actions, [], 'a detached header click must not flip the hidden attached collapse state');
});

test('recents render the selected sparse-row display mode and sparse count class', () => {
  const actions: unknown[] = [];
  const second = { ...record, id: 'recent-2', url: 'https://images.example.test/recent/photo_0043.jpg' };
  const view = buildHistoryView(actions, [], [record, second], true, true, 'half');
  const list = view.querySelector<HTMLElement>('.image-trail-panel__record-list');

  assert.ok(list);
  assert.equal(list.dataset['sparseRowMode'], 'half');
  assert.equal(list.classList.contains('is-sparse-half'), true);
  assert.equal(list.classList.contains('has-sparse-count-2'), true);
  assert.equal(list.classList.contains('has-top-left-metadata'), true);
});

test('Adaptive Recents center metadata at three or more rows (#478)', () => {
  const actions: unknown[] = [];
  const second = { ...record, id: 'recent-2', url: 'https://images.example.test/recent/photo_0043.jpg' };
  const third = { ...record, id: 'recent-3', url: 'https://images.example.test/recent/photo_0044.jpg' };
  const threeRows = buildHistoryView(actions, [], [record, second, third]);
  const twoRows = buildHistoryView(actions, [], [record, second]);
  const threeRowList = threeRows.querySelector<HTMLElement>('.image-trail-panel__record-list');
  const twoRowList = twoRows.querySelector<HTMLElement>('.image-trail-panel__record-list');

  assert.ok(threeRowList);
  assert.ok(twoRowList);
  assert.equal(threeRowList.classList.contains('has-sparse-count-3'), true);
  assert.equal(threeRowList.classList.contains('has-top-left-metadata'), false);
  assert.equal(twoRowList.classList.contains('has-top-left-metadata'), true);
});

test('Backspace removes the selected recent even when encrypted-original keys are unavailable', () => {
  const actions: unknown[] = [];
  const view = createHistoryView([record], ['recent-1'], false, false, (action) => actions.push(action), {
    blobKeyAvailable: false,
    sectionOpen: true,
    collapsible: true,
    listBlockSize: null,
    onListResize: () => undefined,
    sparseRowDisplayMode: 'full',
  });
  const row = rowFor(view, 'recent-1');

  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [{ name: 'history/remove', id: 'recent-1' }]);
});

test('privacy mode keeps masked sparse rows free of record metadata in visible text and titles', () => {
  const actions: unknown[] = [];
  const view = createHistoryView([record], [], false, true, (action) => actions.push(action), {
    blobKeyAvailable: true,
    sectionOpen: true,
    collapsible: true,
    listBlockSize: null,
    onListResize: () => undefined,
    sparseRowDisplayMode: 'full',
    privacyMode: true,
  });
  const row = rowFor(view, 'recent-1');

  assert.match(row.textContent ?? '', /Private image/u);
  assert.doesNotMatch(row.textContent ?? '', /photo_0042\.jpg/u);
  assert.equal(
    row.querySelector<HTMLElement>('.image-trail-panel__bookmark-name')?.title,
    'Privacy mode is hiding this image metadata for screen sharing.',
  );
  assert.equal(row.querySelector<HTMLElement>('.image-trail-panel__record-row-meta')?.title, 'Details hidden');
});
