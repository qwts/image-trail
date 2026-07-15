import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAddRecentHistoryMessage,
  createLoadRecentHistoryMessage,
  createRemoveRecentHistoryMessage,
  createUpdateRecentHistoryMessage,
} from '../extension/src/background/recent-history-messages.js';

const record = { id: 'recent-1', url: 'https://images.example/recent.jpg', timestamp: '2026-07-15T00:00:00.000Z' };

test('recent history message builders carry explicit view scopes', () => {
  const pageUrl = 'https://source.example/gallery';
  assert.equal(createLoadRecentHistoryMessage(pageUrl, { includeRetained: true, scope: 'all' }).payload.scope, 'all');
  assert.equal(createAddRecentHistoryMessage(pageUrl, record, { scope: 'page' }).payload.scope, 'page');
  assert.equal(createUpdateRecentHistoryMessage(pageUrl, record, { scope: 'all' }).payload.scope, 'all');
  assert.equal(createRemoveRecentHistoryMessage(pageUrl, record.id, { scope: 'site' }).payload.scope, 'site');
});
