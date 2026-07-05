import * as v from 'valibot';
import { imageDisplayRecordSchema } from '../../core/display-records.schema.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createAddRecentHistoryResultMessage,
  createLoadRecentHistoryResultMessage,
  createRemoveRecentHistoryResultMessage,
  type AddRecentHistoryMessage,
  type AddRecentHistoryResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type LoadRecentHistoryMessage,
  type LoadRecentHistoryResultMessage,
  type RemoveRecentHistoryMessage,
  type RemoveRecentHistoryResultMessage,
} from '../messages.js';
import type { ServiceWorkerContext } from '../service-worker-context.js';

type RecentHistoryRequestType =
  typeof MessageType.LoadRecentHistory | typeof MessageType.AddRecentHistory | typeof MessageType.RemoveRecentHistory;

export type RecentHistoryMessageHandlerDeps = Pick<ServiceWorkerContext, 'recentHistoryCache' | 'loadLocalSettings'>;

export function createRecentHistoryMessageRegistry({
  recentHistoryCache,
  loadLocalSettings,
}: RecentHistoryMessageHandlerDeps): Record<RecentHistoryRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  async function handleLoadRecentHistory(message: LoadRecentHistoryMessage): Promise<LoadRecentHistoryResultMessage['payload']> {
    const settings = await loadLocalSettings();
    return { items: recentHistoryCache.load(message.payload.pageUrl, settings, message.payload.includeRetained ?? false) };
  }

  async function handleAddRecentHistory(message: AddRecentHistoryMessage): Promise<AddRecentHistoryResultMessage['payload']> {
    const settings = await loadLocalSettings();
    return { items: recentHistoryCache.add(message.payload.pageUrl, message.payload.item, settings) };
  }

  async function handleRemoveRecentHistory(message: RemoveRecentHistoryMessage): Promise<RemoveRecentHistoryResultMessage['payload']> {
    const settings = await loadLocalSettings();
    return { items: recentHistoryCache.remove(message.payload.pageUrl, message.payload.id, settings) };
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
    [MessageType.RemoveRecentHistory]: defineMessage({
      requestSchema: requestSchemas.removeRecentHistoryRequestSchema,
      handle: (message: RemoveRecentHistoryMessage) => handleRemoveRecentHistory(message),
      respond: (result) => createRemoveRecentHistoryResultMessage(result.items),
      fallback: () => createRemoveRecentHistoryResultMessage([]),
    }),
  };
}
