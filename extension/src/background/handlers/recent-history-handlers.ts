import * as v from 'valibot';
import {
  createDisplayRecord,
  isDurableImageSourceUrl,
  withoutStoredOriginal,
  type ImageDisplayRecord,
} from '../../core/display-records.js';
import { imageDisplayRecordSchema } from '../../core/display-records.schema.js';
import { noopLibraryChangeNotifier, type LibraryChangeNotifier } from '../library-change-notifier.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createAddRecentHistoryResultMessage,
  createLoadRecentHistoryResultMessage,
  createRemoveRecentHistoryResultMessage,
  createUpdateRecentHistoryResultMessage,
  type AddRecentHistoryMessage,
  type AddRecentHistoryResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type LoadRecentHistoryMessage,
  type LoadRecentHistoryResultMessage,
  type RemoveRecentHistoryMessage,
  type RemoveRecentHistoryResultMessage,
  type UpdateRecentHistoryMessage,
  type UpdateRecentHistoryResultMessage,
  type AutoPinOverflowStatus,
} from '../messages.js';
import type { ServiceWorkerContext } from '../service-worker-context.js';

type RecentHistoryRequestType =
  | typeof MessageType.LoadRecentHistory
  | typeof MessageType.AddRecentHistory
  | typeof MessageType.UpdateRecentHistory
  | typeof MessageType.RemoveRecentHistory;

export type RecentHistoryMessageHandlerDeps = Pick<ServiceWorkerContext, 'recentHistoryCache' | 'loadLocalSettings'> & {
  readonly bookmarkStore: Pick<ServiceWorkerContext['bookmarkStore'], 'findByUrl' | 'hasProtectedPinForUrl' | 'saveResult'>;
  readonly notifyLibraryChange?: LibraryChangeNotifier;
};

export function createRecentHistoryMessageRegistry({
  recentHistoryCache,
  loadLocalSettings,
  bookmarkStore,
  notifyLibraryChange = noopLibraryChangeNotifier,
}: RecentHistoryMessageHandlerDeps): Record<RecentHistoryRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  async function handleLoadRecentHistory(message: LoadRecentHistoryMessage): Promise<LoadRecentHistoryResultMessage['payload']> {
    await recentHistoryCache.ready();
    const settings = await loadLocalSettings();
    return {
      items: recentHistoryCache.load(message.payload.pageUrl, settings, message.payload.includeRetained ?? false, message.payload.scope),
    };
  }

  async function handleAddRecentHistory(message: AddRecentHistoryMessage): Promise<AddRecentHistoryResultMessage['payload']> {
    await recentHistoryCache.ready();
    const settings = await loadLocalSettings();
    const added = recentHistoryCache.addWithOverflow(
      message.payload.pageUrl,
      message.payload.item,
      settings,
      message.payload.scope,
      message.payload.includeRetained ?? false,
    );
    const promotion = await promoteOverflowCandidates(added.overflowCandidates, bookmarkStore, notifyLibraryChange);
    recentHistoryCache.removeItems(message.payload.pageUrl, promotion.removeIds, message.payload.scope);
    await recentHistoryCache.flush();
    return {
      items: recentHistoryCache.load(message.payload.pageUrl, settings, message.payload.includeRetained ?? false, message.payload.scope),
      autoPinStatus: promotion.status,
    };
  }

  async function handleUpdateRecentHistory(message: UpdateRecentHistoryMessage): Promise<UpdateRecentHistoryResultMessage['payload']> {
    await recentHistoryCache.ready();
    const settings = await loadLocalSettings();
    const items = recentHistoryCache.update(
      message.payload.pageUrl,
      message.payload.item,
      settings,
      message.payload.scope,
      message.payload.includeRetained ?? false,
    );
    await recentHistoryCache.flush();
    return { items };
  }

  async function handleRemoveRecentHistory(message: RemoveRecentHistoryMessage): Promise<RemoveRecentHistoryResultMessage['payload']> {
    await recentHistoryCache.ready();
    const settings = await loadLocalSettings();
    const items = recentHistoryCache.remove(
      message.payload.pageUrl,
      message.payload.id,
      settings,
      message.payload.scope,
      message.payload.includeRetained ?? false,
    );
    await recentHistoryCache.flush();
    return { items };
  }

  return {
    [MessageType.LoadRecentHistory]: defineMessage({
      requestSchema: requestSchemas.loadRecentHistoryRequestSchema,
      handle: (message: LoadRecentHistoryMessage) => handleLoadRecentHistory(message),
      respond: (result) => createLoadRecentHistoryResultMessage(result.items),
      fallback: () => createLoadRecentHistoryResultMessage([]),
    }),
    [MessageType.AddRecentHistory]: defineMessage({
      requestSchema: requestSchemas.addRecentHistoryRequestSchema,
      handle: (message: AddRecentHistoryMessage) => handleAddRecentHistory(message),
      respond: (result) => createAddRecentHistoryResultMessage(result.items, result.autoPinStatus),
      // Only echo the item back optimistically when it is a valid record; a payload that
      // failed validation reaches this fallback too, and its `item` may be malformed.
      fallback: (message) =>
        createAddRecentHistoryResultMessage(v.is(imageDisplayRecordSchema, message.payload.item) ? [message.payload.item] : []),
    }),
    [MessageType.UpdateRecentHistory]: defineMessage({
      requestSchema: requestSchemas.updateRecentHistoryRequestSchema,
      handle: (message: UpdateRecentHistoryMessage) => handleUpdateRecentHistory(message),
      respond: (result) => createUpdateRecentHistoryResultMessage(result.items),
      fallback: () => createUpdateRecentHistoryResultMessage([]),
    }),
    [MessageType.RemoveRecentHistory]: defineMessage({
      requestSchema: requestSchemas.removeRecentHistoryRequestSchema,
      handle: (message: RemoveRecentHistoryMessage) => handleRemoveRecentHistory(message),
      respond: (result) => createRemoveRecentHistoryResultMessage(result.items),
      fallback: () => createRemoveRecentHistoryResultMessage([]),
    }),
  };
}

async function promoteOverflowCandidates(
  candidates: readonly ImageDisplayRecord[],
  bookmarkStore: RecentHistoryMessageHandlerDeps['bookmarkStore'],
  notifyLibraryChange: LibraryChangeNotifier,
): Promise<{ readonly removeIds: readonly string[]; readonly status?: AutoPinOverflowStatus }> {
  if (candidates.length === 0) return { removeIds: [] };
  const removeIds: string[] = [];
  const plaintextReasons: NonNullable<ImageDisplayRecord['pinSaveStorage']>['reason'][] = [];
  let promotedCount = 0;
  let failedCount = 0;
  for (const candidate of [...candidates].reverse()) {
    if (!isDurableImageSourceUrl(candidate.url) && !candidate.url.startsWith('data:image/')) {
      failedCount += 1;
      continue;
    }
    if (candidate.pinnedRecordId) {
      removeIds.push(candidate.id);
      continue;
    }
    const existing = await bookmarkStore.findByUrl(candidate.url);
    const hasLockedProtectedPin = !existing && (await bookmarkStore.hasProtectedPinForUrl(candidate.url));
    if (existing || hasLockedProtectedPin) {
      removeIds.push(candidate.id);
      continue;
    }
    const result = await bookmarkStore.saveResult(autoPinDraft(candidate));
    if (!result.ok) {
      failedCount += 1;
      continue;
    }
    removeIds.push(candidate.id);
    promotedCount += 1;
    if (result.record.pinSaveStorage?.destination === 'plaintext') plaintextReasons.push(result.record.pinSaveStorage.reason);
    notifyLibraryChange({ topic: 'bookmarks', reason: 'bookmark-saved', recordIds: [result.record.id] });
  }
  const status = autoPinStatus(promotedCount, failedCount, plaintextReasons);
  return status ? { removeIds, status } : { removeIds };
}

function autoPinDraft(record: ImageDisplayRecord): ImageDisplayRecord {
  const importedPinId = record.pinnedRecordId ?? record.id;
  const { pinnedAt, pinnedRecordId, queueUpdatedAt, pinSaveStorage, privacyStatus, protectedPin, ...unpinned } =
    withoutStoredOriginal(record);
  void pinnedAt;
  void pinnedRecordId;
  void queueUpdatedAt;
  void pinSaveStorage;
  void privacyStatus;
  void protectedPin;
  return createDisplayRecord({
    ...unpinned,
    id: record.url.startsWith('data:image/') ? importedPinId : record.url,
    timestamp: new Date().toISOString(),
    source: 'bookmark',
  });
}

function autoPinStatus(
  promotedCount: number,
  failedCount: number,
  plaintextReasons: readonly NonNullable<ImageDisplayRecord['pinSaveStorage']>['reason'][],
): AutoPinOverflowStatus | undefined {
  if (promotedCount === 0 && failedCount === 0) return undefined;
  const parts: string[] = [];
  if (promotedCount > 0) {
    const plaintextCount = plaintextReasons.length;
    const storage = plaintextCount > 0 ? `; ${plaintextCount} saved plaintext (${plaintextFallbackLabel(plaintextReasons)})` : '';
    parts.push(`Auto-pinned ${promotedCount} overflow recent${promotedCount === 1 ? '' : 's'}${storage}.`);
  }
  if (failedCount > 0) {
    parts.push(`Could not auto-pin ${failedCount} overflow recent${failedCount === 1 ? '' : 's'}; retained for this session.`);
  }
  return { message: parts.join(' '), tone: failedCount > 0 ? 'error' : 'info', promotedCount, failedCount };
}

function plaintextFallbackLabel(reasons: readonly NonNullable<ImageDisplayRecord['pinSaveStorage']>['reason'][]): string {
  if (reasons.includes('failed')) return 'encrypted storage failed';
  if (reasons.includes('locked')) return 'encrypted storage locked';
  if (reasons.includes('unavailable')) return 'encrypted storage not set up';
  return 'current storage setting';
}
