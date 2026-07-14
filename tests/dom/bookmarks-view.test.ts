import test from 'node:test';
import { resetPreviewRowClickTracking } from '../../extension/src/ui/components/record-row-preview-click.js';
import assert from 'node:assert/strict';

import { createBookmarksView } from '../../extension/src/ui/components/bookmarks-view.js';
import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';

const record: ImageDisplayRecord = {
  id: 'row-1',
  url: 'https://images.example.test/albums/1024/photo_0042.jpg',
  timestamp: '2026-06-25T15:30:00.000Z',
  source: 'bookmark',
};

function buildBookmarksView(
  actions: unknown[],
  overrides: {
    readonly items?: readonly ImageDisplayRecord[];
    readonly selectedIds?: readonly string[];
    readonly total?: number;
    readonly sectionOpen?: boolean;
    readonly collapsible?: boolean;
    readonly displayOrder?: 'front-first' | 'back-first';
  } = {},
): HTMLElement {
  const items = overrides.items ?? [record];
  return createBookmarksView(
    'https://images.example.test/current.jpg',
    items,
    overrides.selectedIds ?? [],
    false,
    true,
    true,
    'global',
    { offset: 0, limit: Math.max(items.length, 1), total: overrides.total ?? items.length, hasOlder: false, hasNewer: false },
    { recallOpen: false },
    { sectionOpen: overrides.sectionOpen ?? true, collapsible: overrides.collapsible ?? true, displayOrder: overrides.displayOrder },
    (action) => actions.push(action),
  );
}

function rowFor(view: HTMLElement, id: string): HTMLElement {
  const row = view.querySelector(`[data-image-trail-scroll-anchor="bookmark:${id}"]`);
  assert.ok(row instanceof HTMLElement, `expected a queue row for record "${id}"`);
  return row;
}

function buttonByText(view: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(view.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
  assert.ok(button, `expected a button labelled "${text}"`);
  return button;
}

test('a plain click selects an unselected queue row without previewing it', () => {
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions);
  const row = rowFor(view, 'row-1');

  assert.ok(row.classList.contains('image-trail-ds__record-row'));
  assert.equal(row.getAttribute('role'), 'button');
  assert.equal(row.tabIndex, 0);

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [{ name: 'bookmark-selection/single', id: 'row-1' }]);
});

test('a double-click on a selected queue row previews it (#426)', () => {
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions, { selectedIds: ['row-1'] });
  const row = rowFor(view, 'row-1');

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [
    { name: 'bookmark-selection/single', id: 'row-1' },
    { name: 'capture/preview', url: record.url, blobId: undefined, scrollAnchorId: 'bookmark:row-1' },
  ]);
});

test('a stale second click on a selected queue row re-selects instead of previewing (#426)', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  resetPreviewRowClickTracking();
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions, { selectedIds: ['row-1'] });
  const row = rowFor(view, 'row-1');

  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  t.mock.timers.tick(501);
  row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [
    { name: 'bookmark-selection/single', id: 'row-1' },
    { name: 'bookmark-selection/single', id: 'row-1' },
  ]);
});

test('a ctrl-click toggles selection without previewing', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions);
  const row = rowFor(view, 'row-1');

  row.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true }));

  assert.deepEqual(actions, [{ name: 'bookmark-selection/toggle', id: 'row-1' }]);
});

test('Enter on an unselected queue row selects without previewing', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions);
  const row = rowFor(view, 'row-1');

  const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
  row.dispatchEvent(enter);

  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(actions, [{ name: 'bookmark-selection/single', id: 'row-1' }]);
});

test('Enter on a selected queue row previews it', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions, { selectedIds: ['row-1'] });
  const row = rowFor(view, 'row-1');

  const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
  row.dispatchEvent(enter);

  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(actions, [{ name: 'capture/preview', url: record.url, blobId: undefined, scrollAnchorId: 'bookmark:row-1' }]);
});

test('ArrowDown moves queue row single selection to the next row', () => {
  const actions: unknown[] = [];
  const second = { ...record, id: 'row-2', url: 'https://images.example.test/albums/1024/photo_0043.jpg' };
  const view = buildBookmarksView(actions, { items: [record, second], selectedIds: ['row-1'] });
  const row = rowFor(view, 'row-1');

  const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true });
  row.dispatchEvent(arrow);

  assert.equal(arrow.defaultPrevented, true);
  assert.deepEqual(actions, [{ name: 'bookmark-selection/single', id: 'row-2' }]);
});

test('ArrowDown restores queue row focus inside a shadow root', async () => {
  const actions: unknown[] = [];
  const second = { ...record, id: 'row-2', url: 'https://images.example.test/albums/1024/photo_0043.jpg' };
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const view = buildBookmarksView(actions, { items: [record, second], selectedIds: ['row-1'] });
  root.append(view);
  document.body.append(host);
  const row = rowFor(view, 'row-1');
  const nextRow = rowFor(view, 'row-2');

  row.focus();
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true }));
  await Promise.resolve();

  assert.equal(root.activeElement, nextRow);
});

test('stored queue rows render the original indicator and clear action', () => {
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
  const view = buildBookmarksView(actions, { items: [captured] });
  const row = rowFor(view, 'row-1');

  assert.ok(row.querySelector('.image-trail-panel__stored-original-dot'));
  buttonByText(view, 'Clear').click();

  assert.deepEqual(actions, [{ name: 'bookmark/clear', id: 'row-1' }]);
});

test('Pin current dispatches pin/current', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions);

  buttonByText(view, 'Pin current').click();

  assert.deepEqual(actions, [{ name: 'pin/current' }]);
});

test('Open gallery dispatches gallery/open from the Queue menu', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions, { items: [], total: 0 });

  buttonByText(view, 'Open gallery').click();

  assert.deepEqual(actions, [{ name: 'gallery/open' }]);
});

test('Repair selected originals is selection-gated and dispatches durable queue ids', () => {
  const unselectedActions: unknown[] = [];
  const unselected = buildBookmarksView(unselectedActions);
  assert.equal(buttonByText(unselected, 'Repair selected originals').disabled, true);

  const actions: unknown[] = [];
  const selected = buildBookmarksView(actions, { selectedIds: ['row-1'] });
  const repair = buttonByText(selected, 'Repair selected originals');
  assert.equal(repair.disabled, false);
  repair.click();

  assert.deepEqual(actions, [{ name: 'capture/repair-selected', ids: ['row-1'] }]);
});

test('pager buttons are disabled when there are no other pages', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions);

  assert.equal(buttonByText(view, 'Front').disabled, true);
  assert.equal(buttonByText(view, 'Back').disabled, true);
});

test('Queue order control dispatches a static back-first display setting', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions);
  const select = view.querySelector<HTMLSelectElement>('select[aria-label="Queue order"]');
  assert.ok(select);
  assert.deepEqual(
    Array.from(select.options, (option) => ({ value: option.value, label: option.textContent })),
    [
      { value: 'front-first', label: 'Front first' },
      { value: 'back-first', label: 'Back first' },
    ],
  );
  select.value = 'back-first';
  select.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [{ name: 'bookmarks/update-display-order', order: 'back-first' }]);
});

test('Queue pager maps front/back availability to back-first display order', () => {
  const actions: unknown[] = [];
  const view = createBookmarksView(
    'https://images.example.test/current.jpg',
    [record],
    [],
    false,
    true,
    true,
    'global',
    { offset: 0, limit: 1, total: 2, hasOlder: true, hasNewer: false },
    { recallOpen: false },
    { displayOrder: 'back-first' },
    (action) => actions.push(action),
  );

  assert.equal(buttonByText(view, 'Front').disabled, false);
  assert.equal(buttonByText(view, 'Back').disabled, true);
  buttonByText(view, 'Front').click();
  assert.deepEqual(actions, [{ name: 'bookmarks/page-front' }]);
});

test('Queue order control stays static when privacy mode masks a locked private row', () => {
  const actions: unknown[] = [];
  const privateRecord = {
    ...record,
    id: 'private-row',
    url: 'image-trail-private:private-row',
    label: 'secret-photo.jpg',
    privacyStatus: 'locked' as const,
    protectedPin: {
      schemaVersion: 1 as const,
      plainPinId: 'private-row',
      queueUpdatedAt: record.timestamp,
      hasEncryptedMetadata: true,
      hasEncryptedThumbnail: true,
      hasStoredOriginal: false,
    },
  };
  const view = buildBookmarksView(actions, { items: [privateRecord] });
  const select = view.querySelector<HTMLSelectElement>('select[aria-label="Queue order"]');
  assert.ok(select);
  assert.ok(!select.outerHTML.includes('secret-photo.jpg'));
  assert.ok(!select.outerHTML.includes('image-trail-private:private-row'));
});

test('Recall is disabled when the queue is empty', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions, { items: [], total: 0 });

  assert.equal(buttonByText(view, 'Recall').disabled, true);
});

test('the Queue sort control stays in the section header while actions render below it (#448)', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions);
  const toolbar = view.querySelector('.image-trail-panel__section-header--with-actions .image-trail-panel__bookmark-toolbar');
  assert.ok(toolbar?.querySelector('select[aria-label="Queue order"]'));
  assert.ok(view.querySelector('.image-trail-panel__bookmark-actions'), 'Queue actions stay outside the constrained header grid');
});

test('the heading toggle collapses and expands the queue section (#438)', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions);
  const toggle = view.querySelector<HTMLElement>('.image-trail-panel__section-header--collapsible');
  assert.ok(toggle);
  assert.equal(toggle.getAttribute('role'), 'button');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), 'Hide the Queue list', 'the accessible name carries the action');

  // Summary ergonomics (#441): the whole header row toggles — a click on the row itself counts.
  toggle.click();
  assert.deepEqual(actions, [{ name: 'panel/bookmarks-section-open', open: false }]);
});

test('a collapsed queue section keeps its actions but hides the rows (#438)', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions, { sectionOpen: false });
  assert.equal(view.querySelector('.image-trail-panel__record-list'), null, 'the list is hidden while collapsed');
  const pinCurrent = [...view.querySelectorAll('button')].find((button) => button.textContent === 'Pin current');
  assert.ok(pinCurrent, 'the action row stays usable while collapsed');

  pinCurrent.click();
  assert.deepEqual(actions, [{ name: 'pin/current' }], 'toolbar clicks never toggle the collapse');
});

test('a non-collapsible render (detached window) has no toggle affordance (#441)', () => {
  const actions: unknown[] = [];
  const view = buildBookmarksView(actions, { collapsible: false });
  const header = view.querySelector<HTMLElement>('.image-trail-panel__section-header');
  assert.ok(header);
  assert.equal(header.getAttribute('role'), null, 'no button role in a detached window');

  header.click();
  assert.deepEqual(actions, [], 'a detached header click must not flip the hidden attached collapse state');
});
