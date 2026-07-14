import test from 'node:test';
import { resetPreviewRowClickTracking } from '../../extension/src/ui/components/record-row-preview-click.js';
import assert from 'node:assert/strict';

import { createRecallDestinationBody } from '../../extension/src/ui/components/recall-destination-view.js';
import type { RecallCandidate } from '../../extension/src/core/types.js';

const record: RecallCandidate = {
  id: 'recall-1',
  url: 'https://images.example.test/recall/photo_0042.jpg',
  timestamp: '2026-06-25T15:30:00.000Z',
  source: 'bookmark',
  envelopeCreatedAt: '2026-06-25T15:30:00.000Z',
};

function buildRecallView(
  actions: unknown[],
  selectedIds: readonly string[] = [],
  candidates: readonly RecallCandidate[] = [record],
): HTMLElement {
  return createRecallDestinationBody(
    {
      busy: false,
      candidates,
      selectedIds,
      offset: 0,
      nextOffset: candidates.length,
      hasMore: false,
      total: candidates.length,
      failedCount: 0,
    },
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

  assert.ok(row.classList.contains('image-trail-ds__record-row'));
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

test('Recall destination reload dispatches through the typed route action', () => {
  const actions: unknown[] = [];
  const view = buildRecallView(actions);
  const reload = Array.from(view.querySelectorAll('button')).find((button) => button.textContent === 'Reload');
  assert.ok(reload);

  reload.click();

  assert.deepEqual(actions, [{ name: 'recall/reload' }]);
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
