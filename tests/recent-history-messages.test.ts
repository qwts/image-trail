import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAddRecentHistoryMessage,
  createLoadRecentHistoryMessage,
  createRemoveRecentHistoryMessage,
  createUpdateRecentHistoryMessage,
} from '../extension/src/background/recent-history-messages.js';

const record = { id: 'recent-1', url: 'https://images.example/recent.jpg', timestamp: '2026-07-15T00:00:00.000Z' };

test('recent history message builders carry explicit view scopes and session-review projection (#209)', () => {
  const pageUrl = 'https://source.example/gallery';
  assert.equal(createLoadRecentHistoryMessage(pageUrl, { includeRetained: true, scope: 'all' }).payload.scope, 'all');
  const add = createAddRecentHistoryMessage(pageUrl, record, { scope: 'page', includeRetained: true });
  const update = createUpdateRecentHistoryMessage(pageUrl, record, { scope: 'all', includeRetained: true });
  const remove = createRemoveRecentHistoryMessage(pageUrl, record.id, { scope: 'site', includeRetained: true });
  assert.equal(add.payload.scope, 'page');
  assert.equal(update.payload.scope, 'all');
  assert.equal(remove.payload.scope, 'site');
  assert.equal(add.payload.includeRetained, true);
  assert.equal(update.payload.includeRetained, true);
  assert.equal(remove.payload.includeRetained, true);
});
