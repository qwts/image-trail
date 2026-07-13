import test from 'node:test';
import assert from 'node:assert/strict';
import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';
import type { GrabSourcePattern, UrlTemplateRecord } from '../extension/src/core/url/templates.js';
import type {
  PanelPosition,
  PanelPositionStore,
  StoredWorkspaceLayout,
  UrlTemplateStore,
  WorkspaceLayoutStore,
} from '../extension/src/core/types.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/data/local-settings.js';
import { createBookmarkMessageRegistry } from '../extension/src/background/handlers/bookmark-message-handlers.js';
import { createAlbumMessageRegistry } from '../extension/src/background/handlers/album-handlers.js';
import { createPanelPositionMessageRegistry } from '../extension/src/background/handlers/panel-position-handlers.js';
import { createPCloudMessageRegistry } from '../extension/src/background/handlers/pcloud-handlers.js';
import { createRecallMessageRegistry, type RecallMessageHandlerDeps } from '../extension/src/background/handlers/recall-handlers.js';
import { createRecentHistoryMessageRegistry } from '../extension/src/background/handlers/recent-history-handlers.js';
import { createUrlTemplateMessageRegistry } from '../extension/src/background/handlers/url-template-handlers.js';
import type { MessageDef } from '../extension/src/background/message-dispatch.js';
import { RecentHistoryCache } from '../extension/src/background/recent-history-cache.js';
import {
  MessageType,
  createAddRecentHistoryMessage,
  createAddAlbumRecordsMessage,
  createCreateAlbumMessage,
  createConnectPCloudProviderMessage,
  createDeleteAlbumMessage,
  createDeleteGrabSourcePatternMessage,
  createDeletePanelPositionMessage,
  createDeleteUrlTemplateMessage,
  createDisconnectPCloudProviderMessage,
  createDownloadPCloudBackupMessage,
  createFindBookmarkByUrlMessage,
  createImportAlbumBackupMessage,
  createListGrabSourcePatternsMessage,
  createListPCloudBackupsMessage,
  createListUrlTemplatesMessage,
  createLoadAlbumsMessage,
  createLoadBookmarksByIdsMessage,
  createLoadBookmarksMessage,
  createLoadPanelPositionMessage,
  createLoadRecallCandidatesMessage,
  createLoadRecentHistoryMessage,
  createPCloudProviderStatusMessage,
  createRecallRecordsMessage,
  createRemoveAlbumRecordMessage,
  createRemoveBookmarkMessage,
  createRemoveBookmarksMessage,
  createRemoveRecallBookmarksMessage,
  createRemoveRecentHistoryMessage,
  createRenameAlbumMessage,
  createSaveBookmarkMessage,
  createSaveGrabSourcePatternMessage,
  createSavePanelPositionMessage,
  createSaveUrlTemplateMessage,
  type AddRecentHistoryMessage,
  type AddRecentHistoryResultMessage,
  type AddAlbumRecordsResultMessage,
  type CreateAlbumResultMessage,
  type DeleteAlbumResultMessage,
  type ConnectPCloudProviderResultMessage,
  type DeleteGrabSourcePatternResultMessage,
  type DeletePanelPositionResultMessage,
  type DeleteUrlTemplateResultMessage,
  type DisconnectPCloudProviderResultMessage,
  type DownloadPCloudBackupResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type FindBookmarkByUrlResultMessage,
  type ListGrabSourcePatternsResultMessage,
  type ListPCloudBackupsResultMessage,
  type ListUrlTemplatesResultMessage,
  type ImportAlbumBackupResultMessage,
  type LoadAlbumsResultMessage,
  type LoadBookmarksByIdsResultMessage,
  type LoadBookmarksResultMessage,
  type LoadPanelPositionResultMessage,
  type LoadRecallCandidatesResultMessage,
  type LoadRecentHistoryResultMessage,
  type PCloudProviderStatusResultMessage,
  type RecallRecordsResultMessage,
  type RemoveAlbumRecordResultMessage,
  type RemoveBookmarkResultMessage,
  type RemoveBookmarksResultMessage,
  type RemoveRecallBookmarksResultMessage,
  type RemoveRecentHistoryResultMessage,
  type RenameAlbumResultMessage,
  type SaveBookmarkResultMessage,
  type SaveGrabSourcePatternResultMessage,
  type SavePanelPositionResultMessage,
  type SaveUrlTemplateResultMessage,
  type UploadPCloudBackupResultMessage,
  MESSAGE_PROTOCOL_VERSION,
} from '../extension/src/background/messages.js';

type AnyEntry = MessageDef<ExtensionRequest, ExtensionResponse>;

/** Runs an entry the way dispatchRequest does — handle, then wrap with respond. */
async function handleAndRespond<Res extends ExtensionResponse>(entry: AnyEntry, message: ExtensionRequest): Promise<Res> {
  return entry.respond(await entry.handle(message)) as Res;
}

function displayRecord(id: string, overrides: Partial<ImageDisplayRecord> = {}): ImageDisplayRecord {
  return { id, url: `https://images.example.com/${id}.jpg`, timestamp: '2026-07-01T00:00:00.000Z', ...overrides };
}

// --- panel position registry ------------------------------------------------

function panelPositionFixture() {
  const positions = new Map<string, PanelPosition>();
  const store: PanelPositionStore = {
    load: async (hostname) => positions.get(hostname) ?? null,
    save: async (hostname, position) => {
      positions.set(hostname, position);
    },
    remove: async (hostname) => {
      positions.delete(hostname);
    },
  };
  const layouts = new Map<string, StoredWorkspaceLayout>();
  const workspaceLayoutStore: WorkspaceLayoutStore = {
    load: async (hostname) => layouts.get(hostname) ?? null,
    save: async (hostname, layout) => {
      layouts.set(hostname, layout);
    },
    remove: async (hostname) => {
      layouts.delete(hostname);
    },
  };
  return { positions, layouts, registry: createPanelPositionMessageRegistry({ panelPositionStore: store, workspaceLayoutStore }) };
}

test('panel position load normalizes the hostname and wraps the stored position', async () => {
  const { positions, registry } = panelPositionFixture();
  positions.set('example.com', { left: 12, top: 34 });

  const response = await handleAndRespond<LoadPanelPositionResultMessage>(
    registry[MessageType.LoadPanelPosition],
    createLoadPanelPositionMessage('  EXAMPLE.com '),
  );

  assert.equal(response.type, MessageType.LoadPanelPositionResult);
  assert.deepEqual(response.payload, { ok: true, position: { left: 12, top: 34 } });
});

test('panel position load answers ok with a null position for a blank hostname', async () => {
  const { registry } = panelPositionFixture();

  const response = await handleAndRespond<LoadPanelPositionResultMessage>(
    registry[MessageType.LoadPanelPosition],
    createLoadPanelPositionMessage('   '),
  );

  assert.deepEqual(response.payload, { ok: true, position: null });
});

test('panel position save persists under the normalized hostname and refuses blank hostnames', async () => {
  const { positions, registry } = panelPositionFixture();

  const saved = await handleAndRespond<SavePanelPositionResultMessage>(
    registry[MessageType.SavePanelPosition],
    createSavePanelPositionMessage(' Example.COM ', { left: 5, top: 7 }),
  );
  assert.equal(saved.type, MessageType.SavePanelPositionResult);
  assert.deepEqual(saved.payload, { ok: true });
  assert.deepEqual(positions.get('example.com'), { left: 5, top: 7 });

  const refused = await handleAndRespond<SavePanelPositionResultMessage>(
    registry[MessageType.SavePanelPosition],
    createSavePanelPositionMessage('', { left: 1, top: 2 }),
  );
  assert.deepEqual(refused.payload, { ok: false });
  assert.equal(positions.size, 1);
});

test('panel position delete removes the normalized hostname and refuses blank hostnames', async () => {
  const { positions, registry } = panelPositionFixture();
  positions.set('example.com', { left: 1, top: 2 });

  const refused = await handleAndRespond<DeletePanelPositionResultMessage>(
    registry[MessageType.DeletePanelPosition],
    createDeletePanelPositionMessage(' '),
  );
  assert.deepEqual(refused.payload, { ok: false });
  assert.equal(positions.size, 1);

  const removed = await handleAndRespond<DeletePanelPositionResultMessage>(
    registry[MessageType.DeletePanelPosition],
    createDeletePanelPositionMessage('EXAMPLE.COM'),
  );
  assert.equal(removed.type, MessageType.DeletePanelPositionResult);
  assert.deepEqual(removed.payload, { ok: true });
  assert.equal(positions.size, 0);
});

test('panel position fallbacks return the documented degraded payloads', () => {
  const { registry } = panelPositionFixture();

  const load = registry[MessageType.LoadPanelPosition].fallback(
    createLoadPanelPositionMessage('example.com'),
  ) as LoadPanelPositionResultMessage;
  assert.equal(load.type, MessageType.LoadPanelPositionResult);
  assert.deepEqual(load.payload, { ok: false, message: 'Panel position could not be loaded.' });

  const save = registry[MessageType.SavePanelPosition].fallback(
    createSavePanelPositionMessage('example.com', { left: 0, top: 0 }),
  ) as SavePanelPositionResultMessage;
  assert.equal(save.type, MessageType.SavePanelPositionResult);
  assert.deepEqual(save.payload, { ok: false });

  const remove = registry[MessageType.DeletePanelPosition].fallback(
    createDeletePanelPositionMessage('example.com'),
  ) as DeletePanelPositionResultMessage;
  assert.equal(remove.type, MessageType.DeletePanelPositionResult);
  assert.deepEqual(remove.payload, { ok: false });
});

// --- url template registry ---------------------------------------------------

function urlTemplateRecord(hostname: string, id = 'template-1'): UrlTemplateRecord {
  return {
    id,
    schemaVersion: 1,
    hostname,
    templateUrl: 'https://example.com/gallery/{page}',
    matchRules: { mode: 'exact-page-shape', hostname, exactPathSignature: '/gallery', pathShapeSignature: '/gallery', querySignature: '' },
    fields: [],
    hideExcludedFields: false,
    autoApplyEnabled: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    useCount: 0,
  };
}

function grabSourcePattern(hostname: string, id = 'pattern-1'): GrabSourcePattern {
  return {
    id,
    schemaVersion: 1,
    hostname,
    patternUrl: 'https://example.com/photo/{id}',
    matchRules: { mode: 'exact-page-shape', hostname, exactPathSignature: '/photo', pathShapeSignature: '/photo', querySignature: '' },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    useCount: 0,
  };
}

function urlTemplateFixture() {
  const templates = new Map<string, UrlTemplateRecord[]>();
  const patterns = new Map<string, GrabSourcePattern[]>();
  const store: UrlTemplateStore = {
    load: async (hostname) => templates.get(hostname) ?? [],
    loadGrabSourcePatterns: async (hostname) => patterns.get(hostname) ?? [],
    save: async (template) => {
      templates.set(template.hostname, [...(templates.get(template.hostname) ?? []), template]);
    },
    saveGrabSourcePattern: async (pattern) => {
      patterns.set(pattern.hostname, [...(patterns.get(pattern.hostname) ?? []), pattern]);
    },
    remove: async (hostname, id) => {
      templates.set(
        hostname,
        (templates.get(hostname) ?? []).filter((template) => template.id !== id),
      );
    },
    removeGrabSourcePattern: async (hostname, id) => {
      patterns.set(
        hostname,
        (patterns.get(hostname) ?? []).filter((pattern) => pattern.id !== id),
      );
    },
  };
  return { templates, patterns, registry: createUrlTemplateMessageRegistry({ urlTemplateStore: store }) };
}

test('url template list normalizes the hostname and answers empty for a blank hostname', async () => {
  const { templates, registry } = urlTemplateFixture();
  templates.set('example.com', [urlTemplateRecord('example.com')]);

  const listed = await handleAndRespond<ListUrlTemplatesResultMessage>(
    registry[MessageType.ListUrlTemplates],
    createListUrlTemplatesMessage(' EXAMPLE.com '),
  );
  assert.equal(listed.type, MessageType.ListUrlTemplatesResult);
  assert.equal(listed.payload.ok, true);
  assert.equal(listed.payload.templates?.length, 1);

  const blank = await handleAndRespond<ListUrlTemplatesResultMessage>(
    registry[MessageType.ListUrlTemplates],
    createListUrlTemplatesMessage(' '),
  );
  assert.deepEqual(blank.payload, { ok: true, templates: [] });
});

test('url template save stores the record under its normalized hostname and refuses blank hostnames', async () => {
  const { templates, registry } = urlTemplateFixture();

  const saved = await handleAndRespond<SaveUrlTemplateResultMessage>(
    registry[MessageType.SaveUrlTemplate],
    createSaveUrlTemplateMessage(urlTemplateRecord(' Example.COM ')),
  );
  assert.equal(saved.type, MessageType.SaveUrlTemplateResult);
  assert.deepEqual(saved.payload, { ok: true });
  assert.equal(templates.get('example.com')?.[0]?.hostname, 'example.com');

  const refused = await handleAndRespond<SaveUrlTemplateResultMessage>(
    registry[MessageType.SaveUrlTemplate],
    createSaveUrlTemplateMessage(urlTemplateRecord('')),
  );
  assert.deepEqual(refused.payload, { ok: false });
  assert.equal(templates.size, 1);
});

test('url template delete removes by normalized hostname and id and refuses blank hostnames', async () => {
  const { templates, registry } = urlTemplateFixture();
  templates.set('example.com', [urlTemplateRecord('example.com')]);

  const refused = await handleAndRespond<DeleteUrlTemplateResultMessage>(
    registry[MessageType.DeleteUrlTemplate],
    createDeleteUrlTemplateMessage('', 'template-1'),
  );
  assert.deepEqual(refused.payload, { ok: false });
  assert.equal(templates.get('example.com')?.length, 1);

  const removed = await handleAndRespond<DeleteUrlTemplateResultMessage>(
    registry[MessageType.DeleteUrlTemplate],
    createDeleteUrlTemplateMessage('EXAMPLE.COM', 'template-1'),
  );
  assert.equal(removed.type, MessageType.DeleteUrlTemplateResult);
  assert.deepEqual(removed.payload, { ok: true });
  assert.equal(templates.get('example.com')?.length, 0);
});

test('grab source pattern list, save, and delete follow the same hostname normalization', async () => {
  const { patterns, registry } = urlTemplateFixture();

  const blankList = await handleAndRespond<ListGrabSourcePatternsResultMessage>(
    registry[MessageType.ListGrabSourcePatterns],
    createListGrabSourcePatternsMessage('  '),
  );
  assert.equal(blankList.type, MessageType.ListGrabSourcePatternsResult);
  assert.deepEqual(blankList.payload, { ok: true, patterns: [] });

  const saved = await handleAndRespond<SaveGrabSourcePatternResultMessage>(
    registry[MessageType.SaveGrabSourcePattern],
    createSaveGrabSourcePatternMessage(grabSourcePattern(' Example.COM ')),
  );
  assert.equal(saved.type, MessageType.SaveGrabSourcePatternResult);
  assert.deepEqual(saved.payload, { ok: true });
  assert.equal(patterns.get('example.com')?.[0]?.hostname, 'example.com');

  const refusedSave = await handleAndRespond<SaveGrabSourcePatternResultMessage>(
    registry[MessageType.SaveGrabSourcePattern],
    createSaveGrabSourcePatternMessage(grabSourcePattern(' ')),
  );
  assert.deepEqual(refusedSave.payload, { ok: false });

  const listed = await handleAndRespond<ListGrabSourcePatternsResultMessage>(
    registry[MessageType.ListGrabSourcePatterns],
    createListGrabSourcePatternsMessage('EXAMPLE.com'),
  );
  assert.equal(listed.payload.ok && listed.payload.patterns.length, 1);

  const refusedDelete = await handleAndRespond<DeleteGrabSourcePatternResultMessage>(
    registry[MessageType.DeleteGrabSourcePattern],
    createDeleteGrabSourcePatternMessage('', 'pattern-1'),
  );
  assert.deepEqual(refusedDelete.payload, { ok: false });

  const removed = await handleAndRespond<DeleteGrabSourcePatternResultMessage>(
    registry[MessageType.DeleteGrabSourcePattern],
    createDeleteGrabSourcePatternMessage(' EXAMPLE.COM ', 'pattern-1'),
  );
  assert.equal(removed.type, MessageType.DeleteGrabSourcePatternResult);
  assert.deepEqual(removed.payload, { ok: true });
  assert.equal(patterns.get('example.com')?.length, 0);
});

test('url template fallbacks return the documented degraded payloads', () => {
  const { registry } = urlTemplateFixture();

  const list = registry[MessageType.ListUrlTemplates].fallback(
    createListUrlTemplatesMessage('example.com'),
  ) as ListUrlTemplatesResultMessage;
  assert.deepEqual(list.payload, { ok: false, message: 'URL templates could not be loaded.' });

  const save = registry[MessageType.SaveUrlTemplate].fallback(
    createSaveUrlTemplateMessage(urlTemplateRecord('example.com')),
  ) as SaveUrlTemplateResultMessage;
  assert.deepEqual(save.payload, { ok: false });

  const remove = registry[MessageType.DeleteUrlTemplate].fallback(
    createDeleteUrlTemplateMessage('example.com', 'template-1'),
  ) as DeleteUrlTemplateResultMessage;
  assert.deepEqual(remove.payload, { ok: false });

  const listPatterns = registry[MessageType.ListGrabSourcePatterns].fallback(
    createListGrabSourcePatternsMessage('example.com'),
  ) as ListGrabSourcePatternsResultMessage;
  assert.deepEqual(listPatterns.payload, { ok: false, message: 'Grab source patterns could not be loaded.' });

  const savePattern = registry[MessageType.SaveGrabSourcePattern].fallback(
    createSaveGrabSourcePatternMessage(grabSourcePattern('example.com')),
  ) as SaveGrabSourcePatternResultMessage;
  assert.deepEqual(savePattern.payload, { ok: false });

  const removePattern = registry[MessageType.DeleteGrabSourcePattern].fallback(
    createDeleteGrabSourcePatternMessage('example.com', 'pattern-1'),
  ) as DeleteGrabSourcePatternResultMessage;
  assert.deepEqual(removePattern.payload, { ok: false });
});

// --- recall registry ----------------------------------------------------------

interface RecallPage {
  readonly items: readonly ImageDisplayRecord[];
  readonly offset: number;
  readonly limit: number;
  readonly nextOffset: number;
  readonly hasMore: boolean;
  readonly total: number;
  readonly failedCount: number;
}

function recallFixture(page: RecallPage, moved: readonly ImageDisplayRecord[]) {
  const calls: { loadRecallPage: unknown[]; moveToFront: (readonly string[])[] } = { loadRecallPage: [], moveToFront: [] };
  const fakeStore = {
    loadRecallPage: async (input: unknown) => {
      calls.loadRecallPage.push(input);
      return page;
    },
    moveToFront: async (ids: readonly string[]) => {
      calls.moveToFront.push(ids);
      return moved;
    },
  };
  // The registry only uses loadRecallPage and moveToFront; the deps type names the concrete store class.
  const bookmarkStore = fakeStore as unknown as RecallMessageHandlerDeps['bookmarkStore'];
  return { calls, registry: createRecallMessageRegistry({ bookmarkStore }) };
}

test('recall candidates clamps paging input, defaults the scope, and maps records to candidates', async () => {
  const record = displayRecord('recall-1');
  const { calls, registry } = recallFixture(
    { items: [record], offset: 0, limit: 100, nextOffset: 1, hasMore: true, total: 3, failedCount: 1 },
    [],
  );

  const response = await handleAndRespond<LoadRecallCandidatesResultMessage>(
    registry[MessageType.LoadRecallCandidates],
    createLoadRecallCandidatesMessage({ offset: -5, limit: 500 }),
  );

  assert.deepEqual(calls.loadRecallPage, [{ offset: 0, limit: 100, scope: 'global', currentPageUrl: undefined }]);
  assert.equal(response.type, MessageType.LoadRecallCandidatesResult);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.candidates?.[0]?.envelopeCreatedAt, record.timestamp);
  assert.equal(response.payload.total, 3);
  assert.equal(response.payload.nextOffset, 1);
  assert.equal(response.payload.hasMore, true);
  assert.equal(response.payload.failedCount, 1);
  assert.equal(response.payload.message, 'Loaded 1 recall record. Showing 1 of 3.');
});

test('recall candidates omits the paging suffix when there is no further page', async () => {
  const { registry } = recallFixture({ items: [], offset: 0, limit: 1, nextOffset: 0, hasMore: false, total: 0, failedCount: 0 }, []);

  const response = await handleAndRespond<LoadRecallCandidatesResultMessage>(
    registry[MessageType.LoadRecallCandidates],
    createLoadRecallCandidatesMessage({ offset: 0, limit: 1, scope: 'site', currentPageUrl: 'https://example.com/a' }),
  );

  assert.equal(response.payload.message, 'Loaded 0 recall records.');
});

test('recall records refuses an all-blank selection before touching the store', async () => {
  const { calls, registry } = recallFixture(
    { items: [], offset: 0, limit: 1, nextOffset: 0, hasMore: false, total: 0, failedCount: 0 },
    [],
  );

  const response = await handleAndRespond<RecallRecordsResultMessage>(
    registry[MessageType.RecallRecords],
    createRecallRecordsMessage(['', '']),
  );

  assert.equal(response.type, MessageType.RecallRecordsResult);
  assert.deepEqual(response.payload, { ok: false, reason: 'empty-selection', message: 'Select one or more records to recall.' });
  assert.equal(calls.moveToFront.length, 0);
});

test('recall records filters blank ids, moves the rest to the front, and counts failures', async () => {
  const moved = [displayRecord('recall-a')];
  const { calls, registry } = recallFixture(
    { items: [], offset: 0, limit: 1, nextOffset: 0, hasMore: false, total: 0, failedCount: 0 },
    moved,
  );

  const response = await handleAndRespond<RecallRecordsResultMessage>(
    registry[MessageType.RecallRecords],
    createRecallRecordsMessage(['recall-a', '', 'recall-b']),
  );

  assert.deepEqual(calls.moveToFront, [['recall-a', 'recall-b']]);
  assert.equal(response.payload.ok, true);
  assert.deepEqual(response.payload.records, moved);
  assert.equal(response.payload.failedCount, 1);
  assert.equal(response.payload.message, 'Recalled 1 record, 1 failed.');
});

test('recall fallbacks return the documented degraded payloads', () => {
  const { registry } = recallFixture({ items: [], offset: 0, limit: 1, nextOffset: 0, hasMore: false, total: 0, failedCount: 0 }, []);

  const candidates = registry[MessageType.LoadRecallCandidates].fallback(
    createLoadRecallCandidatesMessage({ offset: 0, limit: 1 }),
  ) as LoadRecallCandidatesResultMessage;
  assert.equal(candidates.type, MessageType.LoadRecallCandidatesResult);
  assert.deepEqual(candidates.payload, { ok: false, reason: 'unknown', message: 'Recall records could not be loaded.' });

  const records = registry[MessageType.RecallRecords].fallback(createRecallRecordsMessage(['recall-a'])) as RecallRecordsResultMessage;
  assert.equal(records.type, MessageType.RecallRecordsResult);
  assert.deepEqual(records.payload, { ok: false, reason: 'unknown', message: 'Selected records could not be recalled.' });
});

// --- recent history registry ---------------------------------------------------

function recentHistoryFixture() {
  return createRecentHistoryMessageRegistry({
    recentHistoryCache: new RecentHistoryCache(),
    loadLocalSettings: async () => DEFAULT_LOCAL_SETTINGS,
  });
}

test('recent history add, load, and remove round-trip through the cache per page url', async () => {
  const registry = recentHistoryFixture();
  const pageUrl = 'https://example.com/gallery';
  const item = displayRecord('recent-1');

  const added = await handleAndRespond<AddRecentHistoryResultMessage>(
    registry[MessageType.AddRecentHistory],
    createAddRecentHistoryMessage(pageUrl, item),
  );
  assert.equal(added.type, MessageType.AddRecentHistoryResult);
  assert.deepEqual(
    added.payload.items.map((entry) => entry.id),
    ['recent-1'],
  );

  const loaded = await handleAndRespond<LoadRecentHistoryResultMessage>(
    registry[MessageType.LoadRecentHistory],
    createLoadRecentHistoryMessage(pageUrl),
  );
  assert.equal(loaded.type, MessageType.LoadRecentHistoryResult);
  assert.deepEqual(
    loaded.payload.items.map((entry) => entry.id),
    ['recent-1'],
  );

  const otherPage = await handleAndRespond<LoadRecentHistoryResultMessage>(
    registry[MessageType.LoadRecentHistory],
    createLoadRecentHistoryMessage('https://other.example.com/'),
  );
  assert.deepEqual(otherPage.payload.items, []);

  const removed = await handleAndRespond<RemoveRecentHistoryResultMessage>(
    registry[MessageType.RemoveRecentHistory],
    createRemoveRecentHistoryMessage(pageUrl, 'recent-1'),
  );
  assert.equal(removed.type, MessageType.RemoveRecentHistoryResult);
  assert.deepEqual(removed.payload.items, []);
});

test('recent history fallbacks echo a valid add item and degrade to empty lists otherwise', () => {
  const registry = recentHistoryFixture();
  const pageUrl = 'https://example.com/gallery';
  const item = displayRecord('recent-1');

  const load = registry[MessageType.LoadRecentHistory].fallback(createLoadRecentHistoryMessage(pageUrl)) as LoadRecentHistoryResultMessage;
  assert.equal(load.type, MessageType.LoadRecentHistoryResult);
  assert.deepEqual(load.payload.items, []);

  const addValid = registry[MessageType.AddRecentHistory].fallback(
    createAddRecentHistoryMessage(pageUrl, item),
  ) as AddRecentHistoryResultMessage;
  assert.deepEqual(addValid.payload.items, [item]);

  // A payload that failed schema validation reaches the fallback too; a malformed item must not be echoed.
  const malformed: AddRecentHistoryMessage = {
    type: MessageType.AddRecentHistory,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { pageUrl, item: { id: 'recent-2' } as ImageDisplayRecord },
  };
  const addInvalid = registry[MessageType.AddRecentHistory].fallback(malformed) as AddRecentHistoryResultMessage;
  assert.deepEqual(addInvalid.payload.items, []);

  const remove = registry[MessageType.RemoveRecentHistory].fallback(
    createRemoveRecentHistoryMessage(pageUrl, 'recent-1'),
  ) as RemoveRecentHistoryResultMessage;
  assert.deepEqual(remove.payload.items, []);
});

// --- bookmark registry ----------------------------------------------------------

function bookmarkFixture() {
  const record = displayRecord('bookmark-1');
  const calls: Record<string, unknown[]> = {};
  const track = (name: string, value: unknown) => {
    calls[name] = [...(calls[name] ?? []), value];
  };
  const registry = createBookmarkMessageRegistry({
    bookmarkStore: {
      loadPage: async (input) => {
        track('loadPage', input);
        return { items: [record], offset: input.offset, limit: input.limit, total: 1, hasOlder: false, hasNewer: false };
      },
      loadByIds: async (ids) => {
        track('loadByIds', ids);
        return [record];
      },
      findByUrl: async (url) => {
        track('findByUrl', url);
        return url === record.url ? record : null;
      },
      save: async (saved) => {
        track('save', saved);
        return { ...saved, queueUpdatedAt: '2026-07-02T00:00:00.000Z' };
      },
      remove: async (removed) => {
        track('remove', removed);
      },
      removeMany: async (ids) => {
        track('removeMany', ids);
        return { removedCount: ids.length };
      },
      removeRecallPage: async (input) => {
        track('removeRecallPage', input);
        return { removedCount: 2 };
      },
    },
  });
  return { record, calls, registry };
}

test('bookmark load, find, and save entries pass payloads through and wrap the store results', async () => {
  const { record, calls, registry } = bookmarkFixture();

  const page = await handleAndRespond<LoadBookmarksResultMessage>(
    registry[MessageType.LoadBookmarks],
    createLoadBookmarksMessage({ offset: 3, limit: 7 }),
  );
  assert.equal(page.type, MessageType.LoadBookmarksResult);
  assert.deepEqual(page.payload, { items: [record], offset: 3, limit: 7, total: 1, hasOlder: false, hasNewer: false });

  const byIds = await handleAndRespond<LoadBookmarksByIdsResultMessage>(
    registry[MessageType.LoadBookmarksByIds],
    createLoadBookmarksByIdsMessage(['bookmark-1']),
  );
  assert.equal(byIds.type, MessageType.LoadBookmarksByIdsResult);
  assert.deepEqual(byIds.payload, { items: [record] });
  assert.deepEqual(calls['loadByIds'], [['bookmark-1']]);

  const found = await handleAndRespond<FindBookmarkByUrlResultMessage>(
    registry[MessageType.FindBookmarkByUrl],
    createFindBookmarkByUrlMessage(record.url),
  );
  assert.equal(found.type, MessageType.FindBookmarkByUrlResult);
  assert.deepEqual(found.payload, { record });

  const missing = await handleAndRespond<FindBookmarkByUrlResultMessage>(
    registry[MessageType.FindBookmarkByUrl],
    createFindBookmarkByUrlMessage('https://example.com/other.jpg'),
  );
  assert.deepEqual(missing.payload, { record: null });

  const saved = await handleAndRespond<SaveBookmarkResultMessage>(registry[MessageType.SaveBookmark], createSaveBookmarkMessage(record));
  assert.equal(saved.type, MessageType.SaveBookmarkResult);
  assert.deepEqual(saved.payload, { ok: true, record: { ...record, queueUpdatedAt: '2026-07-02T00:00:00.000Z' } });
});

test('bookmark remove entries report ok with the store removal counts', async () => {
  const { record, calls, registry } = bookmarkFixture();

  const removed = await handleAndRespond<RemoveBookmarkResultMessage>(
    registry[MessageType.RemoveBookmark],
    createRemoveBookmarkMessage(record),
  );
  assert.equal(removed.type, MessageType.RemoveBookmarkResult);
  assert.deepEqual(removed.payload, { ok: true });
  assert.deepEqual(calls['remove'], [record]);

  const removedMany = await handleAndRespond<RemoveBookmarksResultMessage>(
    registry[MessageType.RemoveBookmarks],
    createRemoveBookmarksMessage(['bookmark-1', 'bookmark-2']),
  );
  assert.equal(removedMany.type, MessageType.RemoveBookmarksResult);
  assert.deepEqual(removedMany.payload, { ok: true, removedCount: 2 });

  const removedRecall = await handleAndRespond<RemoveRecallBookmarksResultMessage>(
    registry[MessageType.RemoveRecallBookmarks],
    createRemoveRecallBookmarksMessage({ offset: 4, scope: 'global' }),
  );
  assert.equal(removedRecall.type, MessageType.RemoveRecallBookmarksResult);
  assert.deepEqual(removedRecall.payload, { ok: true, removedCount: 2 });
  assert.deepEqual(calls['removeRecallPage'], [{ offset: 4, scope: 'global' }]);
});

test('bookmark fallbacks return the documented degraded payloads', () => {
  const { record, registry } = bookmarkFixture();

  const page = registry[MessageType.LoadBookmarks].fallback(
    createLoadBookmarksMessage({ offset: 3, limit: 7 }),
  ) as LoadBookmarksResultMessage;
  assert.equal(page.type, MessageType.LoadBookmarksResult);
  // The fallback echoes the requested window so the panel keeps its paging state.
  assert.deepEqual(page.payload, { items: [], offset: 3, limit: 7, total: 0, hasOlder: false, hasNewer: false });

  const byIds = registry[MessageType.LoadBookmarksByIds].fallback(
    createLoadBookmarksByIdsMessage(['bookmark-1']),
  ) as LoadBookmarksByIdsResultMessage;
  assert.deepEqual(byIds.payload, { items: [] });

  const found = registry[MessageType.FindBookmarkByUrl].fallback(
    createFindBookmarkByUrlMessage(record.url),
  ) as FindBookmarkByUrlResultMessage;
  assert.deepEqual(found.payload, { record: null });

  const saved = registry[MessageType.SaveBookmark].fallback(createSaveBookmarkMessage(record)) as SaveBookmarkResultMessage;
  assert.deepEqual(saved.payload, { ok: false, message: 'Bookmark save failed.' });

  const removed = registry[MessageType.RemoveBookmark].fallback(createRemoveBookmarkMessage(record)) as RemoveBookmarkResultMessage;
  assert.deepEqual(removed.payload, { ok: false });

  const removedMany = registry[MessageType.RemoveBookmarks].fallback(
    createRemoveBookmarksMessage(['bookmark-1']),
  ) as RemoveBookmarksResultMessage;
  assert.deepEqual(removedMany.payload, { ok: false, removedCount: 0 });

  const removedRecall = registry[MessageType.RemoveRecallBookmarks].fallback(
    createRemoveRecallBookmarksMessage({ offset: 0 }),
  ) as RemoveRecallBookmarksResultMessage;
  assert.deepEqual(removedRecall.payload, { ok: false, removedCount: 0 });
});

// --- album registry ---------------------------------------------------------

function albumFixture() {
  const album = {
    id: 'album-1',
    schemaVersion: 1 as const,
    name: 'Field work',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
  const membership = {
    id: 'album-1:record-1',
    schemaVersion: 1 as const,
    albumId: 'album-1',
    recordId: 'record-1',
    position: 0,
    addedAt: '2026-07-01T00:00:01.000Z',
  };
  const imported = { importedAlbumCount: 1, importedMembershipCount: 1, skippedMembershipCount: 1 };
  const registry = createAlbumMessageRegistry({
    albumStore: {
      listSnapshot: async () => ({ albums: [album], memberships: [membership] }),
      createAlbum: async (name) => ({ ...album, name }),
      renameAlbum: async (_albumId, name) => ({ ...album, name, updatedAt: '2026-07-02T00:00:00.000Z' }),
      deleteAlbum: async () => true,
      addRecords: async () => [membership],
      removeRecord: async () => true,
      importBackupEntries: async () => imported,
    },
  });
  return { album, membership, imported, registry };
}

test('album registry wraps CRUD and membership operations', async () => {
  const { album, membership, registry } = albumFixture();

  const loaded = await handleAndRespond<LoadAlbumsResultMessage>(registry[MessageType.LoadAlbums], createLoadAlbumsMessage());
  assert.equal(loaded.type, MessageType.LoadAlbumsResult);
  assert.deepEqual(loaded.payload, { ok: true, albums: [album], memberships: [membership] });

  const created = await handleAndRespond<CreateAlbumResultMessage>(registry[MessageType.CreateAlbum], createCreateAlbumMessage('Restored'));
  assert.deepEqual(created.payload, { ok: true, album: { ...album, name: 'Restored' } });

  const renamed = await handleAndRespond<RenameAlbumResultMessage>(
    registry[MessageType.RenameAlbum],
    createRenameAlbumMessage(album.id, 'Renamed'),
  );
  assert.deepEqual(renamed.payload, { ok: true, album: { ...album, name: 'Renamed', updatedAt: '2026-07-02T00:00:00.000Z' } });

  const added = await handleAndRespond<AddAlbumRecordsResultMessage>(
    registry[MessageType.AddAlbumRecords],
    createAddAlbumRecordsMessage(album.id, ['record-1']),
  );
  assert.deepEqual(added.payload, { ok: true, memberships: [membership] });

  const removed = await handleAndRespond<RemoveAlbumRecordResultMessage>(
    registry[MessageType.RemoveAlbumRecord],
    createRemoveAlbumRecordMessage(album.id, 'record-1'),
  );
  assert.deepEqual(removed.payload, { ok: true });

  const deleted = await handleAndRespond<DeleteAlbumResultMessage>(registry[MessageType.DeleteAlbum], createDeleteAlbumMessage(album.id));
  assert.deepEqual(deleted.payload, { ok: true });
});

test('album registry imports backup entries with record id remaps', async () => {
  const { imported, registry } = albumFixture();

  const response = await handleAndRespond<ImportAlbumBackupResultMessage>(
    registry[MessageType.ImportAlbumBackup],
    createImportAlbumBackupMessage({
      albums: [
        {
          id: 'backup-album',
          name: 'Backup',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:01.000Z',
          recordIds: ['old-record', 'missing-record'],
        },
      ],
      recordIdMap: [{ sourceId: 'old-record', targetId: 'record-1' }],
    }),
  );

  assert.deepEqual(response.payload, { ok: true, ...imported });
});

test('album fallbacks return documented degraded payloads', () => {
  const { album, registry } = albumFixture();

  assert.deepEqual(registry[MessageType.LoadAlbums].fallback(createLoadAlbumsMessage()) as LoadAlbumsResultMessage, {
    type: MessageType.LoadAlbumsResult,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { ok: false, message: 'Albums could not be loaded.' },
  });
  assert.deepEqual((registry[MessageType.CreateAlbum].fallback(createCreateAlbumMessage('x')) as CreateAlbumResultMessage).payload, {
    ok: false,
    message: 'Album could not be created.',
  });
  assert.deepEqual(
    (registry[MessageType.RenameAlbum].fallback(createRenameAlbumMessage(album.id, 'x')) as RenameAlbumResultMessage).payload,
    {
      ok: false,
      message: 'Album could not be renamed.',
    },
  );
  assert.deepEqual((registry[MessageType.DeleteAlbum].fallback(createDeleteAlbumMessage(album.id)) as DeleteAlbumResultMessage).payload, {
    ok: false,
  });
  assert.deepEqual(
    (registry[MessageType.AddAlbumRecords].fallback(createAddAlbumRecordsMessage(album.id, ['record-1'])) as AddAlbumRecordsResultMessage)
      .payload,
    { ok: false, message: 'Record could not be added to the album.' },
  );
  assert.deepEqual(
    (
      registry[MessageType.RemoveAlbumRecord].fallback(
        createRemoveAlbumRecordMessage(album.id, 'record-1'),
      ) as RemoveAlbumRecordResultMessage
    ).payload,
    { ok: false },
  );
});

// --- pcloud registry --------------------------------------------------------------
// The pCloud provider guards every chrome.* access, so under Node (no `chrome`) each
// handler resolves to its documented disconnected/invalid-input degradation.

const pcloudRegistry = createPCloudMessageRegistry();

test('pcloud status and disconnect resolve to their disconnected payloads without chrome', async () => {
  const status = await handleAndRespond<PCloudProviderStatusResultMessage>(
    pcloudRegistry[MessageType.PCloudProviderStatus],
    createPCloudProviderStatusMessage(),
  );
  assert.equal(status.type, MessageType.PCloudProviderStatusResult);
  assert.deepEqual(status.payload, { connected: false, backupHistory: [] });

  const disconnected = await handleAndRespond<DisconnectPCloudProviderResultMessage>(
    pcloudRegistry[MessageType.DisconnectPCloudProvider],
    createDisconnectPCloudProviderMessage(),
  );
  assert.equal(disconnected.type, MessageType.DisconnectPCloudProviderResult);
  assert.deepEqual(disconnected.payload, {
    ok: true,
    status: { connected: false, message: 'pCloud disconnected.' },
    message: 'pCloud disconnected.',
  });
});

test('pcloud connect reports a failed connection without chrome identity', async () => {
  const response = await handleAndRespond<ConnectPCloudProviderResultMessage>(
    pcloudRegistry[MessageType.ConnectPCloudProvider],
    createConnectPCloudProviderMessage(),
  );
  assert.equal(response.type, MessageType.ConnectPCloudProviderResult);
  assert.equal(response.payload.ok, false);
  assert.equal(response.payload.status.connected, false);
});

test('pcloud upload, list, and download degrade to invalid-input and not-connected reasons', async () => {
  const uploadEntry = pcloudRegistry[MessageType.UploadPCloudBackup];
  const invalidUpload = await handleAndRespond<UploadPCloudBackupResultMessage>(uploadEntry, {
    type: MessageType.UploadPCloudBackup,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { fileName: '   ', fileContent: 'cipher' },
  });
  assert.equal(invalidUpload.type, MessageType.UploadPCloudBackupResult);
  assert.equal(invalidUpload.payload.ok, false);
  assert.equal(invalidUpload.payload.ok === false && invalidUpload.payload.reason, 'invalid-input');

  const disconnectedUpload = await handleAndRespond<UploadPCloudBackupResultMessage>(uploadEntry, {
    type: MessageType.UploadPCloudBackup,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { fileName: 'backup.json', fileContent: 'cipher' },
  });
  assert.equal(disconnectedUpload.payload.ok === false && disconnectedUpload.payload.reason, 'not-connected');

  const list = await handleAndRespond<ListPCloudBackupsResultMessage>(
    pcloudRegistry[MessageType.ListPCloudBackups],
    createListPCloudBackupsMessage(),
  );
  assert.equal(list.type, MessageType.ListPCloudBackupsResult);
  assert.equal(list.payload.ok === false && list.payload.reason, 'not-connected');

  const badName = await handleAndRespond<DownloadPCloudBackupResultMessage>(
    pcloudRegistry[MessageType.DownloadPCloudBackup],
    createDownloadPCloudBackupMessage({ fileId: 7, fileName: 'not-a-backup.txt' }),
  );
  assert.equal(badName.type, MessageType.DownloadPCloudBackupResult);
  assert.equal(badName.payload.ok === false && badName.payload.reason, 'invalid-input');

  const badId = await handleAndRespond<DownloadPCloudBackupResultMessage>(
    pcloudRegistry[MessageType.DownloadPCloudBackup],
    createDownloadPCloudBackupMessage({ fileId: 0, fileName: 'backup.image-trail-encrypted.json' }),
  );
  assert.equal(badId.payload.ok === false && badId.payload.reason, 'invalid-input');

  const disconnectedDownload = await handleAndRespond<DownloadPCloudBackupResultMessage>(
    pcloudRegistry[MessageType.DownloadPCloudBackup],
    createDownloadPCloudBackupMessage({ fileId: 7, fileName: 'backup.image-trail-encrypted.json' }),
  );
  assert.equal(disconnectedDownload.payload.ok === false && disconnectedDownload.payload.reason, 'not-connected');
});

test('pcloud fallbacks return the documented degraded payloads', () => {
  const status = pcloudRegistry[MessageType.PCloudProviderStatus].fallback(
    createPCloudProviderStatusMessage(),
  ) as PCloudProviderStatusResultMessage;
  assert.deepEqual(status.payload, { connected: false, message: 'pCloud status could not be loaded.' });

  const connect = pcloudRegistry[MessageType.ConnectPCloudProvider].fallback(
    createConnectPCloudProviderMessage(),
  ) as ConnectPCloudProviderResultMessage;
  assert.deepEqual(connect.payload, {
    ok: false,
    status: { connected: false, message: 'pCloud connection failed.' },
    message: 'pCloud connection failed.',
  });

  const disconnect = pcloudRegistry[MessageType.DisconnectPCloudProvider].fallback(
    createDisconnectPCloudProviderMessage(),
  ) as DisconnectPCloudProviderResultMessage;
  assert.deepEqual(disconnect.payload, {
    ok: false,
    status: { connected: false, message: 'pCloud disconnect failed.' },
    message: 'pCloud disconnect failed.',
  });

  const upload = pcloudRegistry[MessageType.UploadPCloudBackup].fallback({
    type: MessageType.UploadPCloudBackup,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { fileName: 'backup.json', fileContent: 'cipher' },
  }) as UploadPCloudBackupResultMessage;
  assert.deepEqual(upload.payload, {
    ok: false,
    status: { connected: false, message: 'pCloud backup upload failed.', messageIsError: true },
    reason: 'upload-failed',
    message: 'pCloud backup upload failed.',
  });

  const list = pcloudRegistry[MessageType.ListPCloudBackups].fallback(createListPCloudBackupsMessage()) as ListPCloudBackupsResultMessage;
  assert.deepEqual(list.payload, {
    ok: false,
    status: { connected: false, message: 'pCloud backups could not be listed.', messageIsError: true },
    reason: 'list-failed',
    message: 'pCloud backups could not be listed.',
  });

  const download = pcloudRegistry[MessageType.DownloadPCloudBackup].fallback(
    createDownloadPCloudBackupMessage({ fileId: 7, fileName: 'backup.image-trail-encrypted.json' }),
  ) as DownloadPCloudBackupResultMessage;
  assert.deepEqual(download.payload, {
    ok: false,
    status: { connected: false, message: 'pCloud backup could not be downloaded.', messageIsError: true },
    reason: 'download-failed',
    message: 'pCloud backup could not be downloaded.',
  });
});
