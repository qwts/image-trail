import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeHistoryState, getVisibleHistory, reduceRuntimeHistory } from '../extension/src/data/runtime/runtime-history.js';
import { UndoStack } from '../extension/src/data/runtime/undo-stack.js';

test('runtime history keeps loaded images newest-first, deduped, and visibly bounded', () => {
  let state = createRuntimeHistoryState(3, 5);
  for (let index = 0; index < 6; index += 1) {
    state = reduceRuntimeHistory(state, {
      name: 'history/add-loaded',
      item: { url: `https://example.test/${index}.jpg`, timestamp: `2026-06-17T00:00:0${index}.000Z` },
    });
  }

  state = reduceRuntimeHistory(state, {
    name: 'history/add-loaded',
    item: { url: 'https://example.test/3.jpg', timestamp: '2026-06-17T00:00:09.000Z' },
  });

  assert.deepEqual(
    state.items.map((item) => item.url),
    [
      'https://example.test/3.jpg',
      'https://example.test/5.jpg',
      'https://example.test/4.jpg',
      'https://example.test/2.jpg',
      'https://example.test/1.jpg',
    ],
  );
  assert.deepEqual(
    getVisibleHistory(state).map((item) => item.url),
    ['https://example.test/3.jpg', 'https://example.test/5.jpg', 'https://example.test/4.jpg'],
  );
});

test('undo stack returns session restore actions in last-action-first order', () => {
  const undo = new UndoStack<{ readonly name: 'bookmark/restore'; readonly id: string }>(2);
  undo.push({ label: 'Restore first', action: { name: 'bookmark/restore', id: 'first' } });
  undo.push({ label: 'Restore second', action: { name: 'bookmark/restore', id: 'second' } });
  undo.push({ label: 'Restore third', action: { name: 'bookmark/restore', id: 'third' } });

  assert.equal(undo.size, 2);
  assert.equal(undo.pop()?.action.id, 'third');
  assert.equal(undo.pop()?.action.id, 'second');
  assert.equal(undo.pop(), undefined);
});

test('target selection alone does not commit runtime history before load success', async () => {
  const { createInitialPanelState, setTargetState } = await import('../extension/src/core/state.js');
  const state = createInitialPanelState(0);
  const selected = setTargetState(
    state,
    {
      mode: 'manual',
      picking: false,
      candidateCount: 1,
      selectedUrl: 'https://example.test/pending.jpg',
      selectedHandleId: 'target-1',
      selectedDimensions: '640×480',
      message: 'Selected pending image.',
    },
    1,
  );

  assert.deepEqual(selected.history, []);
});
