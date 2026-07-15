import test from 'node:test';
import assert from 'node:assert/strict';

import { createRecentHistoryMessageRegistry } from '../extension/src/background/handlers/recent-history-handlers.js';
import type { MessageDef } from '../extension/src/background/message-dispatch.js';
import {
  MessageType,
  createAddRecentHistoryMessage,
  createLoadRecentHistoryMessage,
  createUpdateRecentHistoryMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type LoadRecentHistoryResultMessage,
} from '../extension/src/background/messages.js';
import { RecentHistoryCache } from '../extension/src/background/recent-history-cache.js';
import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/data/local-settings.js';

type AnyEntry = MessageDef<ExtensionRequest, ExtensionResponse>;

async function handleAndRespond(entry: AnyEntry, message: ExtensionRequest): Promise<LoadRecentHistoryResultMessage> {
  return entry.respond(await entry.handle(message)) as LoadRecentHistoryResultMessage;
}

function record(id: string): ImageDisplayRecord {
  return { id, url: `https://images.example/${id}.jpg`, timestamp: '2026-07-15T00:00:00.000Z' };
}

test('recent history handlers compose page, site, and all scopes through the transient cache', async () => {
  const registry = createRecentHistoryMessageRegistry({
    recentHistoryCache: new RecentHistoryCache(),
    loadLocalSettings: async () => DEFAULT_LOCAL_SETTINGS,
  });
  for (const [pageUrl, id] of [
    ['https://a.example/page-one', 'a-one'],
    ['https://a.example/page-two', 'a-two'],
    ['https://b.example/page-one', 'b-one'],
  ] as const) {
    await registry[MessageType.AddRecentHistory].handle(createAddRecentHistoryMessage(pageUrl, record(id)));
  }

  const load = (scope: 'page' | 'site' | 'all') =>
    handleAndRespond(registry[MessageType.LoadRecentHistory], createLoadRecentHistoryMessage('https://a.example/page-one', { scope }));
  assert.deepEqual(
    (await load('page')).payload.items.map((item) => item.id),
    ['a-one'],
  );
  assert.deepEqual(
    (await load('site')).payload.items.map((item) => item.id),
    ['a-two', 'a-one'],
  );
  assert.deepEqual(
    (await load('all')).payload.items.map((item) => item.id),
    ['b-one', 'a-two', 'a-one'],
  );

  await registry[MessageType.UpdateRecentHistory].handle(
    createUpdateRecentHistoryMessage('https://a.example/page-one', { ...record('b-one'), pinnedRecordId: 'pin-b' }, { scope: 'all' }),
  );
  assert.deepEqual(
    (await load('site')).payload.items.map((item) => item.id),
    ['a-two', 'a-one'],
    'updating an all-sites row from another site does not re-home it',
  );
});
