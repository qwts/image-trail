import type { BookmarkSaveOptions } from '../../core/bookmark-save-options.js';
import type { ImageDisplayRecord } from '../../core/display-records.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType } from '../message-protocol.js';

export interface LoadBookmarksMessage {
  readonly type: typeof MessageType.LoadBookmarks;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site' | undefined;
    readonly currentPageUrl?: string | undefined;
    readonly displayOrder?: import('../../core/display-order.js').QueueDisplayOrder | undefined;
  };
}

export interface LoadBookmarksResultMessage {
  readonly type: typeof MessageType.LoadBookmarksResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly items: readonly ImageDisplayRecord[];
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasOlder: boolean;
    readonly hasNewer: boolean;
  };
}

export interface LoadBookmarksByIdsMessage {
  readonly type: typeof MessageType.LoadBookmarksByIds;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ids: readonly string[] };
}

export interface LoadBookmarksByIdsResultMessage {
  readonly type: typeof MessageType.LoadBookmarksByIdsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly items: readonly ImageDisplayRecord[] };
}

export interface FindBookmarkByUrlMessage {
  readonly type: typeof MessageType.FindBookmarkByUrl;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly url: string };
}

export interface FindBookmarkByUrlResultMessage {
  readonly type: typeof MessageType.FindBookmarkByUrlResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: ImageDisplayRecord | null };
}

export interface SaveBookmarkMessage {
  readonly type: typeof MessageType.SaveBookmark;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: ImageDisplayRecord; readonly options?: BookmarkSaveOptions | undefined };
}

export interface SaveBookmarkResultMessage {
  readonly type: typeof MessageType.SaveBookmarkResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly record: ImageDisplayRecord } | { readonly ok: false; readonly message: string };
}

export interface RemoveBookmarkMessage {
  readonly type: typeof MessageType.RemoveBookmark;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: ImageDisplayRecord };
}

export interface RemoveBookmarkResultMessage {
  readonly type: typeof MessageType.RemoveBookmarkResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface RemoveBookmarksMessage {
  readonly type: typeof MessageType.RemoveBookmarks;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ids: readonly string[] };
}

export interface RemoveBookmarksResultMessage {
  readonly type: typeof MessageType.RemoveBookmarksResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean; readonly removedCount: number };
}

export interface RemoveRecallBookmarksMessage {
  readonly type: typeof MessageType.RemoveRecallBookmarks;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly offset: number;
    readonly scope?: 'global' | 'site' | undefined;
    readonly currentPageUrl?: string | undefined;
  };
}

export interface RemoveRecallBookmarksResultMessage {
  readonly type: typeof MessageType.RemoveRecallBookmarksResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean; readonly removedCount: number };
}

export function createLoadBookmarksMessage(payload: LoadBookmarksMessage['payload']): LoadBookmarksMessage {
  return { type: MessageType.LoadBookmarks, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadBookmarksResultMessage(payload: LoadBookmarksResultMessage['payload']): LoadBookmarksResultMessage {
  return { type: MessageType.LoadBookmarksResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadBookmarksByIdsMessage(ids: readonly string[]): LoadBookmarksByIdsMessage {
  return { type: MessageType.LoadBookmarksByIds, version: MESSAGE_PROTOCOL_VERSION, payload: { ids } };
}

export function createLoadBookmarksByIdsResultMessage(
  payload: LoadBookmarksByIdsResultMessage['payload'],
): LoadBookmarksByIdsResultMessage {
  return { type: MessageType.LoadBookmarksByIdsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createFindBookmarkByUrlMessage(url: string): FindBookmarkByUrlMessage {
  return { type: MessageType.FindBookmarkByUrl, version: MESSAGE_PROTOCOL_VERSION, payload: { url } };
}

export function createFindBookmarkByUrlResultMessage(payload: FindBookmarkByUrlResultMessage['payload']): FindBookmarkByUrlResultMessage {
  return { type: MessageType.FindBookmarkByUrlResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveBookmarkMessage(record: ImageDisplayRecord, options?: BookmarkSaveOptions): SaveBookmarkMessage {
  return { type: MessageType.SaveBookmark, version: MESSAGE_PROTOCOL_VERSION, payload: { record, options } };
}

export function createSaveBookmarkResultMessage(payload: SaveBookmarkResultMessage['payload']): SaveBookmarkResultMessage {
  return { type: MessageType.SaveBookmarkResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveBookmarkMessage(record: ImageDisplayRecord): RemoveBookmarkMessage {
  return { type: MessageType.RemoveBookmark, version: MESSAGE_PROTOCOL_VERSION, payload: { record } };
}

export function createRemoveBookmarkResultMessage(payload: RemoveBookmarkResultMessage['payload']): RemoveBookmarkResultMessage {
  return { type: MessageType.RemoveBookmarkResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveBookmarksMessage(ids: readonly string[]): RemoveBookmarksMessage {
  return { type: MessageType.RemoveBookmarks, version: MESSAGE_PROTOCOL_VERSION, payload: { ids } };
}

export function createRemoveBookmarksResultMessage(payload: RemoveBookmarksResultMessage['payload']): RemoveBookmarksResultMessage {
  return { type: MessageType.RemoveBookmarksResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveRecallBookmarksMessage(payload: RemoveRecallBookmarksMessage['payload']): RemoveRecallBookmarksMessage {
  return { type: MessageType.RemoveRecallBookmarks, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveRecallBookmarksResultMessage(
  payload: RemoveRecallBookmarksResultMessage['payload'],
): RemoveRecallBookmarksResultMessage {
  return { type: MessageType.RemoveRecallBookmarksResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export type BookmarkRequest =
  | LoadBookmarksMessage
  | LoadBookmarksByIdsMessage
  | FindBookmarkByUrlMessage
  | SaveBookmarkMessage
  | RemoveBookmarkMessage
  | RemoveBookmarksMessage
  | RemoveRecallBookmarksMessage;

export type BookmarkResponse =
  | LoadBookmarksResultMessage
  | LoadBookmarksByIdsResultMessage
  | FindBookmarkByUrlResultMessage
  | SaveBookmarkResultMessage
  | RemoveBookmarkResultMessage
  | RemoveBookmarksResultMessage
  | RemoveRecallBookmarksResultMessage;
