import {
  createLoadRecallCandidatesMessage,
  createRecallRecordsMessage,
  isLoadRecallCandidatesResultMessage,
  isRecallRecordsResultMessage,
} from '../background/messages.js';
import type { RecallCandidate } from '../core/types.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { sendRuntimeMessage } from './runtime-message.js';

export interface RecallCandidatesResult {
  readonly ok: boolean;
  readonly candidates: readonly RecallCandidate[];
  readonly total: number;
  readonly nextOffset: number;
  readonly hasMore: boolean;
  readonly failedCount: number;
  readonly message: string;
  readonly reason?: string;
}

export interface RecallRecordsResult {
  readonly ok: boolean;
  readonly records: readonly ImageDisplayRecord[];
  readonly failedCount: number;
  readonly message: string;
  readonly reason?: string;
}

export class RecallStore {
  async loadCandidates(input: {
    readonly offset: number;
    readonly limit?: number;
    readonly scope?: 'global' | 'site';
    readonly currentPageUrl?: string;
  }): Promise<RecallCandidatesResult> {
    const response = await sendRuntimeMessage(createLoadRecallCandidatesMessage({ ...input, limit: input.limit ?? 100 }));
    if (!isLoadRecallCandidatesResultMessage(response)) {
      return {
        ok: false,
        candidates: [],
        total: 0,
        nextOffset: input.offset,
        hasMore: false,
        failedCount: 0,
        reason: 'unknown',
        message: 'Recall records could not be loaded.',
      };
    }
    if (!response.payload.ok) {
      return {
        ok: false,
        candidates: [],
        total: 0,
        nextOffset: input.offset,
        hasMore: false,
        failedCount: 0,
        reason: response.payload.reason,
        message: response.payload.message,
      };
    }
    return response.payload;
  }

  async recall(ids: readonly string[]): Promise<RecallRecordsResult> {
    const response = await sendRuntimeMessage(createRecallRecordsMessage(ids));
    if (!isRecallRecordsResultMessage(response)) {
      return { ok: false, records: [], failedCount: 0, reason: 'unknown', message: 'Selected recall records could not be recalled.' };
    }
    if (!response.payload.ok) {
      return { ok: false, records: [], failedCount: 0, reason: response.payload.reason, message: response.payload.message };
    }
    return response.payload;
  }
}
