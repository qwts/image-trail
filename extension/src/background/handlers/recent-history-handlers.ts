import * as v from 'valibot';
import { imageDisplayRecordSchema } from '../../core/display-records.schema.js';
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
} from '../messages.js';
import type { ServiceWorkerContext } from '../service-worker-context.js';

type RecentHistoryRequestType =
  | typeof MessageType.LoadRecentHistory
  | typeof MessageType.AddRecentHistory
  | typeof MessageType.UpdateRecentHistory
  | typeof MessageType.RemoveRecentHistory;

export type RecentHistoryMessageHandlerDeps = Pick<ServiceWorkerContext, 'recentHistoryCache' | 'loadLocalSettings'>;

export function createRecentHistoryMessageRegistry({
  recentHistoryCache,
  loadLocalSettings,
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
    const items = recentHistoryCache.add(message.payload.pageUrl, message.payload.item, settings, message.payload.scope);
    await recentHistoryCache.flush();
    return { items };
  }

  async function handleUpdateRecentHistory(message: UpdateRecentHistoryMessage): Promise<UpdateRecentHistoryResultMessage['payload']> {
    await recentHistoryCache.ready();
    const settings = await loadLocalSettings();
    const items = recentHistoryCache.update(message.payload.pageUrl, message.payload.item, settings, message.payload.scope);
    await recentHistoryCache.flush();
    return { items };
  }

  async function handleRemoveRecentHistory(message: RemoveRecentHistoryMessage): Promise<RemoveRecentHistoryResultMessage['payload']> {
    await recentHistoryCache.ready();
    const settings = await loadLocalSettings();
    const items = recentHistoryCache.remove(message.payload.pageUrl, message.payload.id, settings, message.payload.scope);
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
      respond: (result) => createAddRecentHistoryResultMessage(result.items),
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
