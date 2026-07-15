import type { ImageDisplayRecord } from '../core/display-records.js';
import type { RecentHistoryScope } from '../core/recent-history-scope.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType, hasVersionedObjectShape } from './message-protocol.js';

interface RecentHistoryRequestPayload {
  readonly pageUrl: string;
  readonly scope?: RecentHistoryScope | undefined;
}

export interface LoadRecentHistoryMessage {
  readonly type: typeof MessageType.LoadRecentHistory;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: RecentHistoryRequestPayload & { readonly includeRetained?: boolean | undefined };
}

export interface LoadRecentHistoryResultMessage {
  readonly type: typeof MessageType.LoadRecentHistoryResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly items: readonly ImageDisplayRecord[] };
}

export interface AddRecentHistoryMessage {
  readonly type: typeof MessageType.AddRecentHistory;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: RecentHistoryRequestPayload & { readonly item: ImageDisplayRecord };
}

export interface AddRecentHistoryResultMessage {
  readonly type: typeof MessageType.AddRecentHistoryResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly items: readonly ImageDisplayRecord[] };
}

export interface UpdateRecentHistoryMessage {
  readonly type: typeof MessageType.UpdateRecentHistory;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: RecentHistoryRequestPayload & { readonly item: ImageDisplayRecord };
}

export interface UpdateRecentHistoryResultMessage {
  readonly type: typeof MessageType.UpdateRecentHistoryResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly items: readonly ImageDisplayRecord[] };
}

export interface RemoveRecentHistoryMessage {
  readonly type: typeof MessageType.RemoveRecentHistory;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: RecentHistoryRequestPayload & { readonly id: string };
}

export interface RemoveRecentHistoryResultMessage {
  readonly type: typeof MessageType.RemoveRecentHistoryResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly items: readonly ImageDisplayRecord[] };
}

export type RecentHistoryRequest =
  LoadRecentHistoryMessage | AddRecentHistoryMessage | UpdateRecentHistoryMessage | RemoveRecentHistoryMessage;
export type RecentHistoryResponse =
  LoadRecentHistoryResultMessage | AddRecentHistoryResultMessage | UpdateRecentHistoryResultMessage | RemoveRecentHistoryResultMessage;

export function createLoadRecentHistoryMessage(
  pageUrl: string,
  options: { readonly includeRetained?: boolean; readonly scope?: RecentHistoryScope } = {},
): LoadRecentHistoryMessage {
  return { type: MessageType.LoadRecentHistory, version: MESSAGE_PROTOCOL_VERSION, payload: { pageUrl, ...options } };
}

export function createLoadRecentHistoryResultMessage(items: readonly ImageDisplayRecord[]): LoadRecentHistoryResultMessage {
  return { type: MessageType.LoadRecentHistoryResult, version: MESSAGE_PROTOCOL_VERSION, payload: { items } };
}

export function createAddRecentHistoryMessage(
  pageUrl: string,
  item: ImageDisplayRecord,
  options: { readonly scope?: RecentHistoryScope } = {},
): AddRecentHistoryMessage {
  return { type: MessageType.AddRecentHistory, version: MESSAGE_PROTOCOL_VERSION, payload: { pageUrl, item, ...options } };
}

export function createAddRecentHistoryResultMessage(items: readonly ImageDisplayRecord[]): AddRecentHistoryResultMessage {
  return { type: MessageType.AddRecentHistoryResult, version: MESSAGE_PROTOCOL_VERSION, payload: { items } };
}

export function createUpdateRecentHistoryMessage(
  pageUrl: string,
  item: ImageDisplayRecord,
  options: { readonly scope?: RecentHistoryScope } = {},
): UpdateRecentHistoryMessage {
  return { type: MessageType.UpdateRecentHistory, version: MESSAGE_PROTOCOL_VERSION, payload: { pageUrl, item, ...options } };
}

export function createUpdateRecentHistoryResultMessage(items: readonly ImageDisplayRecord[]): UpdateRecentHistoryResultMessage {
  return { type: MessageType.UpdateRecentHistoryResult, version: MESSAGE_PROTOCOL_VERSION, payload: { items } };
}

export function createRemoveRecentHistoryMessage(
  pageUrl: string,
  id: string,
  options: { readonly scope?: RecentHistoryScope } = {},
): RemoveRecentHistoryMessage {
  return { type: MessageType.RemoveRecentHistory, version: MESSAGE_PROTOCOL_VERSION, payload: { pageUrl, id, ...options } };
}

export function createRemoveRecentHistoryResultMessage(items: readonly ImageDisplayRecord[]): RemoveRecentHistoryResultMessage {
  return { type: MessageType.RemoveRecentHistoryResult, version: MESSAGE_PROTOCOL_VERSION, payload: { items } };
}

export function isLoadRecentHistoryResultMessage(value: unknown): value is LoadRecentHistoryResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.LoadRecentHistoryResult;
}

export function isAddRecentHistoryResultMessage(value: unknown): value is AddRecentHistoryResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.AddRecentHistoryResult;
}

export function isUpdateRecentHistoryResultMessage(value: unknown): value is UpdateRecentHistoryResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.UpdateRecentHistoryResult;
}

export function isRemoveRecentHistoryResultMessage(value: unknown): value is RemoveRecentHistoryResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.RemoveRecentHistoryResult;
}
