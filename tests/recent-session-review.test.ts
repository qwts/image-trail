import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';

test('recent session review is session-only and uses the retained limit until explicitly finished (#209)', () => {
  let state: PanelState = {
    ...createInitialPanelState(0),
    recentHistoryLimit: 1,
    recentHistoryRetainedLimit: 3,
    recentHistoryOverflowBehavior: 'keep-session',
  };

  state = reducePanelAction(state, { name: 'history/review-session' });
  assert.equal(state.reviewingRecentSession, true);
  for (let index = 0; index < 3; index += 1) {
    state = reducePanelAction(state, {
      name: 'history/add-loaded',
      url: `https://example.test/review-${index}.jpg`,
      timestamp: `2026-06-19T00:00:0${index}.000Z`,
    });
  }
  assert.equal(state.history.length, 3);
  assert.equal(state.bookmarks.length, 0);

  state = reducePanelAction(state, { name: 'history/finish-session-review' });
  assert.equal(state.reviewingRecentSession, false);
  state = reducePanelAction(state, {
    name: 'history/add-loaded',
    url: 'https://example.test/visible-only.jpg',
    timestamp: '2026-06-19T00:00:04.000Z',
  });
  assert.equal(state.history.length, 1);
  assert.equal(state.bookmarks.length, 0);
});
