import type { ImageDisplayRecord } from '../../core/display-records.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType } from '../message-protocol.js';

export interface LoadRecallCandidatesMessage {
  readonly type: typeof MessageType.LoadRecallCandidates;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site' | undefined;
    readonly currentPageUrl?: string | undefined;
  };
}

export interface LoadRecallCandidatesResultMessage {
  readonly type: typeof MessageType.LoadRecallCandidatesResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly candidates: readonly import('../../core/types.js').RecallCandidate[];
        readonly total: number;
        readonly nextOffset: number;
        readonly hasMore: boolean;
        readonly failedCount: number;
        readonly message: string;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface RecallRecordsMessage {
  readonly type: typeof MessageType.RecallRecords;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ids: readonly string[] };
}

export interface RecallRecordsResultMessage {
  readonly type: typeof MessageType.RecallRecordsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly records: readonly ImageDisplayRecord[];
        readonly failedCount: number;
        readonly message: string;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export function createLoadRecallCandidatesMessage(input: {
  readonly offset: number;
  readonly limit: number;
  readonly scope?: 'global' | 'site' | undefined;
  readonly currentPageUrl?: string | undefined;
}): LoadRecallCandidatesMessage {
  return { type: MessageType.LoadRecallCandidates, version: MESSAGE_PROTOCOL_VERSION, payload: input };
}

export function createLoadRecallCandidatesResultMessage(
  payload: LoadRecallCandidatesResultMessage['payload'],
): LoadRecallCandidatesResultMessage {
  return { type: MessageType.LoadRecallCandidatesResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRecallRecordsMessage(ids: readonly string[]): RecallRecordsMessage {
  return { type: MessageType.RecallRecords, version: MESSAGE_PROTOCOL_VERSION, payload: { ids } };
}

export function createRecallRecordsResultMessage(payload: RecallRecordsResultMessage['payload']): RecallRecordsResultMessage {
  return { type: MessageType.RecallRecordsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export type RecallRequest = LoadRecallCandidatesMessage | RecallRecordsMessage;

export type RecallResponse = LoadRecallCandidatesResultMessage | RecallRecordsResultMessage;
