import type { ImageDisplayRecord } from '../../core/display-records.js';
import type { RecallCandidate } from '../../core/types.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createLoadRecallCandidatesResultMessage,
  createRecallRecordsResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type LoadRecallCandidatesMessage,
  type LoadRecallCandidatesResultMessage,
  type RecallRecordsMessage,
  type RecallRecordsResultMessage,
} from '../messages.js';
import type { ServiceWorkerContext } from '../service-worker-context.js';

type RecallRequestType = typeof MessageType.LoadRecallCandidates | typeof MessageType.RecallRecords;

export type RecallMessageHandlerDeps = Pick<ServiceWorkerContext, 'bookmarkStore'>;

function toRecallCandidate(record: ImageDisplayRecord): RecallCandidate {
  return { ...record, envelopeCreatedAt: record.timestamp };
}

export function createRecallMessageRegistry({
  bookmarkStore,
}: RecallMessageHandlerDeps): Record<RecallRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  async function handleLoadRecallCandidates(message: LoadRecallCandidatesMessage): Promise<LoadRecallCandidatesResultMessage['payload']> {
    const offset = Math.max(0, message.payload.offset);
    const limit = Math.max(1, Math.min(100, message.payload.limit));
    const page = await bookmarkStore.loadRecallPage({
      offset,
      limit,
      scope: message.payload.scope ?? 'global',
      currentPageUrl: message.payload.currentPageUrl,
    });
    const candidates = page.items.map(toRecallCandidate);
    const moreMessage = page.hasMore ? ` Showing ${candidates.length} of ${page.total}.` : '';
    return {
      ok: true,
      candidates,
      total: page.total,
      nextOffset: page.nextOffset,
      hasMore: page.hasMore,
      failedCount: page.failedCount,
      message: `Loaded ${candidates.length} recall record${candidates.length === 1 ? '' : 's'}.${moreMessage}`,
    };
  }

  async function handleRecallRecords(message: RecallRecordsMessage): Promise<RecallRecordsResultMessage['payload']> {
    const ids = message.payload.ids.filter(Boolean);
    if (ids.length === 0) return { ok: false, reason: 'empty-selection', message: 'Select one or more records to recall.' };
    const records = await bookmarkStore.moveToFront(ids);
    const failedCount = ids.length - records.length;
    return {
      ok: true,
      records,
      failedCount,
      message: `Recalled ${records.length} record${records.length === 1 ? '' : 's'}${failedCount ? `, ${failedCount} failed` : ''}.`,
    };
  }

  return {
    [MessageType.LoadRecallCandidates]: defineMessage({
      requestSchema: requestSchemas.loadRecallCandidatesRequestSchema,
      handle: (message: LoadRecallCandidatesMessage) => handleLoadRecallCandidates(message),
      respond: (result) => createLoadRecallCandidatesResultMessage(result),
      fallback: () =>
        createLoadRecallCandidatesResultMessage({ ok: false, reason: 'unknown', message: 'Recall records could not be loaded.' }),
    }),
    [MessageType.RecallRecords]: defineMessage({
      requestSchema: requestSchemas.recallRecordsRequestSchema,
      handle: (message: RecallRecordsMessage) => handleRecallRecords(message),
      respond: (result) => createRecallRecordsResultMessage(result),
      fallback: () =>
        createRecallRecordsResultMessage({ ok: false, reason: 'unknown', message: 'Selected records could not be recalled.' }),
    }),
  };
}
