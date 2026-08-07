import test from 'node:test';
import assert from 'node:assert/strict';

import { createRecentHistoryMessageRegistry } from '../extension/src/background/handlers/recent-history-handlers.js';
import type { MessageDef } from '../extension/src/background/message-dispatch.js';
import {
  MessageType,
  createAddRecentHistoryMessage,
  createLoadRecentHistoryMessage,
  createRemoveRecentHistoryMessage,
  type AddRecentHistoryMessage,
  type AddRecentHistoryResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type LoadRecentHistoryResultMessage,
  type RemoveRecentHistoryResultMessage,
  MESSAGE_PROTOCOL_VERSION,
} from '../extension/src/background/messages.js';
import { RecentHistoryCache } from '../extension/src/background/recent-history-cache.js';
import { createDisplayRecord, type ImageDisplayRecord } from '../extension/src/core/display-records.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/data/local-settings.js';

const pageUrl = 'https://example.com/gallery';
const settings = {
  ...DEFAULT_LOCAL_SETTINGS,
  recentHistoryLimit: 1,
  recentHistoryRetainedLimit: 3,
  recentHistoryOverflowBehavior: 'auto-pin' as const,
};

function record(id: string): ImageDisplayRecord {
  return createDisplayRecord({ id, url: `https://images.example/${id}.jpg`, timestamp: '2026-07-15T00:00:00.000Z' });
}

async function add(registry: ReturnType<typeof createRecentHistoryMessageRegistry>, id: string): Promise<AddRecentHistoryResultMessage> {
  const entry = registry[MessageType.AddRecentHistory] as MessageDef<ExtensionRequest, ExtensionResponse>;
  const message = createAddRecentHistoryMessage(pageUrl, record(id));
  return entry.respond(await entry.handle(message)) as AddRecentHistoryResultMessage;
}

function recentHistoryFixture() {
  return createRecentHistoryMessageRegistry({
    recentHistoryCache: new RecentHistoryCache(),
    loadLocalSettings: async () => DEFAULT_LOCAL_SETTINGS,
    bookmarkStore: {
      findByUrl: async () => null,
      hasProtectedPinForUrl: async () => false,
      saveResult: async (candidate) => ({ ok: true as const, record: candidate }),
    },
  });
}

test('recent history add, load, and remove round-trip through the cache per page url', async () => {
  const registry = recentHistoryFixture();
  const item = record('recent-1');
  const added = await add(registry, 'recent-1');
  assert.deepEqual(
    added.payload.items.map((entry) => entry.id),
    ['recent-1'],
  );

  const loadEntry = registry[MessageType.LoadRecentHistory] as MessageDef<ExtensionRequest, ExtensionResponse>;
  const loaded = loadEntry.respond(await loadEntry.handle(createLoadRecentHistoryMessage(pageUrl))) as LoadRecentHistoryResultMessage;
  assert.deepEqual(
    loaded.payload.items.map((entry) => entry.id),
    ['recent-1'],
  );
  const otherPage = loadEntry.respond(
    await loadEntry.handle(createLoadRecentHistoryMessage('https://other.example.com/')),
  ) as LoadRecentHistoryResultMessage;
  assert.deepEqual(otherPage.payload.items, []);

  const removeEntry = registry[MessageType.RemoveRecentHistory] as MessageDef<ExtensionRequest, ExtensionResponse>;
  const removed = removeEntry.respond(
    await removeEntry.handle(createRemoveRecentHistoryMessage(pageUrl, item.id)),
  ) as RemoveRecentHistoryResultMessage;
  assert.deepEqual(removed.payload.items, []);
});

test('recent history fallbacks echo a valid add item and degrade to empty lists otherwise', () => {
  const registry = recentHistoryFixture();
  const item = record('recent-1');
  const load = registry[MessageType.LoadRecentHistory].fallback(createLoadRecentHistoryMessage(pageUrl)) as LoadRecentHistoryResultMessage;
  assert.deepEqual(load.payload.items, []);
  const addValid = registry[MessageType.AddRecentHistory].fallback(
    createAddRecentHistoryMessage(pageUrl, item),
  ) as AddRecentHistoryResultMessage;
  assert.deepEqual(addValid.payload.items, [item]);

  const malformed: AddRecentHistoryMessage = {
    type: MessageType.AddRecentHistory,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { pageUrl, item: { id: 'recent-2' } as ImageDisplayRecord },
  };
  const addInvalid = registry[MessageType.AddRecentHistory].fallback(malformed) as AddRecentHistoryResultMessage;
  assert.deepEqual(addInvalid.payload.items, []);
  const remove = registry[MessageType.RemoveRecentHistory].fallback(
    createRemoveRecentHistoryMessage(pageUrl, item.id),
  ) as RemoveRecentHistoryResultMessage;
  assert.deepEqual(remove.payload.items, []);
});

test('auto-pin overflow uses the durable save path and reports plaintext fallback without capturing an original', async () => {
  const saved: ImageDisplayRecord[] = [];
  const notifications: string[][] = [];
  const registry = createRecentHistoryMessageRegistry({
    recentHistoryCache: new RecentHistoryCache(),
    loadLocalSettings: async () => settings,
    bookmarkStore: {
      findByUrl: async () => null,
      hasProtectedPinForUrl: async () => false,
      saveResult: async (candidate) => {
        const plaintext = { ...candidate, pinSaveStorage: { destination: 'plaintext' as const, reason: 'locked' as const } };
        saved.push(plaintext);
        return { ok: true as const, record: plaintext };
      },
    },
    notifyLibraryChange: (event) => notifications.push([...(event.recordIds ?? [])]),
  });
  const addEntry = registry[MessageType.AddRecentHistory] as MessageDef<ExtensionRequest, ExtensionResponse>;
  const storedOriginal = {
    blobId: 'blob-one',
    mimeType: 'image/jpeg',
    byteLength: 42,
    capturedAt: '2026-07-15T00:00:00.000Z',
  };
  await addEntry.handle(
    createAddRecentHistoryMessage(pageUrl, {
      ...record('one'),
      captureStatus: 'captured',
      blobId: storedOriginal.blobId,
      capturedAt: storedOriginal.capturedAt,
      storedOriginal,
    }),
  );
  const response = await add(registry, 'two');

  assert.deepEqual(
    response.payload.items.map((item) => item.id),
    ['two'],
  );
  assert.equal(response.payload.autoPinStatus?.promotedCount, 1);
  assert.match(response.payload.autoPinStatus?.message ?? '', /saved plaintext.*locked/u);
  assert.equal(saved[0]?.source, 'bookmark');
  assert.equal(saved[0]?.captureStatus, undefined);
  assert.equal(saved[0]?.blobId, undefined);
  assert.equal(saved[0]?.capturedAt, undefined);
  assert.equal(saved[0]?.storedOriginal, undefined);
  assert.deepEqual(notifications, [[saved[0]?.id ?? '']]);
});

test('failed auto-pin overflow remains in transient session storage for retry', async () => {
  const cache = new RecentHistoryCache();
  const registry = createRecentHistoryMessageRegistry({
    recentHistoryCache: cache,
    loadLocalSettings: async () => settings,
    bookmarkStore: {
      findByUrl: async () => null,
      hasProtectedPinForUrl: async () => false,
      saveResult: async () => ({ ok: false as const, message: 'storage unavailable' }),
    },
  });
  await add(registry, 'one');
  const response = await add(registry, 'two');

  assert.equal(response.payload.autoPinStatus?.failedCount, 1);
  assert.match(response.payload.autoPinStatus?.message ?? '', /retained for this session/u);
  assert.deepEqual(
    cache.load(pageUrl, settings, true).map((item) => item.id),
    ['two', 'one'],
  );
});

test('failed auto-pin reports only candidates retained in the bounded retry window', async () => {
  const cache = new RecentHistoryCache();
  const registry = createRecentHistoryMessageRegistry({
    recentHistoryCache: cache,
    loadLocalSettings: async () => settings,
    bookmarkStore: {
      findByUrl: async () => null,
      hasProtectedPinForUrl: async () => false,
      saveResult: async () => ({ ok: false as const, message: 'storage unavailable' }),
    },
  });
  for (const id of ['one', 'two', 'three', 'four']) await add(registry, id);
  const response = await add(registry, 'five');

  assert.equal(response.payload.autoPinStatus?.failedCount, 3);
  assert.deepEqual(
    cache.load(pageUrl, settings, true).map((item) => item.id),
    ['five', 'four', 'three', 'two'],
    'every candidate reported as failed remains available for a later session retry',
  );
});

test('failed auto-pin remains retained when visible and retained limits are equal', async () => {
  const equalLimits = { ...settings, recentHistoryRetainedLimit: settings.recentHistoryLimit };
  const cache = new RecentHistoryCache();
  const registry = createRecentHistoryMessageRegistry({
    recentHistoryCache: cache,
    loadLocalSettings: async () => equalLimits,
    bookmarkStore: {
      findByUrl: async () => null,
      hasProtectedPinForUrl: async () => false,
      saveResult: async () => ({ ok: false as const, message: 'storage unavailable' }),
    },
  });
  await add(registry, 'one');
  const response = await add(registry, 'two');

  assert.equal(response.payload.autoPinStatus?.failedCount, 1);
  assert.deepEqual(
    cache.load(pageUrl, equalLimits, true).map((item) => item.id),
    ['two', 'one'],
  );
});

test('an existing durable pin is not re-saved or reordered', async () => {
  let saveCalls = 0;
  const registry = createRecentHistoryMessageRegistry({
    recentHistoryCache: new RecentHistoryCache(),
    loadLocalSettings: async () => settings,
    bookmarkStore: {
      findByUrl: async (url) => ({ ...record('existing'), id: url, url, queueUpdatedAt: '2026-01-01T00:00:00.000Z' }),
      hasProtectedPinForUrl: async () => false,
      saveResult: async (candidate) => {
        saveCalls += 1;
        return { ok: true as const, record: candidate };
      },
    },
  });
  await add(registry, 'one');
  const response = await add(registry, 'two');

  assert.equal(saveCalls, 0);
  assert.equal(response.payload.autoPinStatus, undefined);
  assert.deepEqual(
    response.payload.items.map((item) => item.id),
    ['two'],
  );
});

test('an imported data Recent reuses its linked durable pin without saving or reordering', async () => {
  let saveCalls = 0;
  const cache = new RecentHistoryCache();
  const registry = createRecentHistoryMessageRegistry({
    recentHistoryCache: cache,
    loadLocalSettings: async () => settings,
    bookmarkStore: {
      findByUrl: async () => null,
      hasProtectedPinForUrl: async () => false,
      saveResult: async () => {
        saveCalls += 1;
        return { ok: false as const, message: 'must not save a linked pin again' };
      },
    },
  });
  const addEntry = registry[MessageType.AddRecentHistory] as MessageDef<ExtensionRequest, ExtensionResponse>;
  const imported = createDisplayRecord({
    id: 'recent-import',
    url: 'data:image/png;base64,AQID',
    timestamp: '2026-07-15T00:00:00.000Z',
    pinnedRecordId: 'image-trail-import:bookmark-import',
  });
  await addEntry.handle(createAddRecentHistoryMessage(pageUrl, imported));
  const response = addEntry.respond(
    await addEntry.handle(createAddRecentHistoryMessage(pageUrl, record('two'))),
  ) as AddRecentHistoryResultMessage;

  assert.equal(saveCalls, 0);
  assert.equal(response.payload.autoPinStatus, undefined);
  assert.deepEqual(
    cache.load(pageUrl, settings, true).map((item) => item.id),
    ['two'],
  );
});

test('all-sites auto-pin promotes and removes the actual global overflow row', async () => {
  const cache = new RecentHistoryCache();
  const saved: ImageDisplayRecord[] = [];
  const registry = createRecentHistoryMessageRegistry({
    recentHistoryCache: cache,
    loadLocalSettings: async () => settings,
    bookmarkStore: {
      findByUrl: async () => null,
      hasProtectedPinForUrl: async () => false,
      saveResult: async (candidate) => {
        saved.push(candidate);
        return { ok: true as const, record: candidate };
      },
    },
  });
  const addEntry = registry[MessageType.AddRecentHistory] as MessageDef<ExtensionRequest, ExtensionResponse>;
  await addEntry.handle(createAddRecentHistoryMessage('https://first.example/page', record('one'), { scope: 'all' }));
  const response = addEntry.respond(
    await addEntry.handle(createAddRecentHistoryMessage('https://second.example/page', record('two'), { scope: 'all' })),
  ) as AddRecentHistoryResultMessage;

  assert.deepEqual(
    saved.map((item) => item.id),
    ['https://images.example/one.jpg'],
  );
  assert.deepEqual(
    response.payload.items.map((item) => item.id),
    ['two'],
  );
  assert.deepEqual(cache.load('https://first.example/page', settings, true, 'site'), []);
});

test('a locked protected pin is detected by URL hash before auto-pin can create a plaintext duplicate', async () => {
  let saveCalls = 0;
  const protectedUrlChecks: string[] = [];
  const registry = createRecentHistoryMessageRegistry({
    recentHistoryCache: new RecentHistoryCache(),
    loadLocalSettings: async () => settings,
    bookmarkStore: {
      findByUrl: async () => null,
      hasProtectedPinForUrl: async (url) => {
        protectedUrlChecks.push(url);
        return url.endsWith('/one.jpg');
      },
      saveResult: async (candidate) => {
        saveCalls += 1;
        return { ok: true as const, record: candidate };
      },
    },
  });
  await add(registry, 'one');
  const response = await add(registry, 'two');

  assert.deepEqual(protectedUrlChecks, ['https://images.example/one.jpg']);
  assert.equal(saveCalls, 0);
  assert.equal(response.payload.autoPinStatus, undefined);
  assert.deepEqual(
    response.payload.items.map((item) => item.id),
    ['two'],
  );
});
