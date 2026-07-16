import type { InteropReviewCategory, InteropTransferPhase } from '../../core/interop/contract.js';
import type { InteropEnvelope } from '../../core/interop/messages.js';
import type * as v from 'valibot';
import { hydrateRecord } from '../repositories/hydration.js';
import { moveItemId, type MoveItemRecord, type MoveOriginalVerification, type StoredMoveAuditEvent } from './move-journal-types.js';

export type MoveRecordEnvelope = InteropEnvelope & {
  readonly payload: Extract<InteropEnvelope['payload'], { readonly kind: 'record' }>;
};
export type MoveAcknowledgementEnvelope = InteropEnvelope & {
  readonly payload: Extract<InteropEnvelope['payload'], { readonly kind: 'acknowledgement' }>;
};

export interface TargetAcknowledgementInput {
  readonly reviewCategory: InteropReviewCategory;
  readonly targetLocalId: string | null;
  readonly metadataPersisted: boolean;
  readonly originalVerification: Exclude<MoveOriginalVerification, 'pending'>;
  readonly error: unknown;
  readonly at: string;
}

export function isMoveRecordEnvelope(envelope: InteropEnvelope): envelope is MoveRecordEnvelope {
  return envelope.payload.kind === 'record';
}

export function isMoveAcknowledgementEnvelope(envelope: InteropEnvelope): envelope is MoveAcknowledgementEnvelope {
  return envelope.payload.kind === 'acknowledgement';
}

export function sameMoveValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function hydrateRequiredMove<T>(store: string, schema: v.GenericSchema<unknown, T>, value: unknown, message: string): T {
  const result = hydrateRecord(store, schema, value);
  if (!result) throw new Error(message);
  return result;
}

export function queuedMoveItem(envelope: MoveRecordEnvelope): MoveItemRecord {
  return {
    id: moveItemId(envelope.header.transferId, envelope.payload.record.identity.interopId),
    transferId: envelope.header.transferId,
    interopId: envelope.payload.record.identity.interopId,
    sourceMessageId: envelope.header.messageId,
    sourceLocalId: envelope.payload.record.identity.origin.localId,
    reviewCategory: envelope.payload.reviewCategory,
    record: envelope.payload.record,
    albums: envelope.payload.albums,
    state: 'queued',
    targetLocalId: null,
    metadataPersisted: false,
    originalVerification: 'pending',
    acknowledgementMessageId: null,
    acknowledgedMessageIds: [],
    error: null,
    receivedAt: null,
    acknowledgedAt: null,
    finalizedAt: null,
  };
}

export function targetMoveItem(
  request: MoveRecordEnvelope,
  acknowledgement: MoveAcknowledgementEnvelope,
  input: TargetAcknowledgementInput,
): MoveItemRecord {
  const accepted = acknowledgement.payload.status === 'accepted';
  return {
    ...queuedMoveItem(request),
    reviewCategory: input.reviewCategory,
    state: accepted ? 'acknowledged' : 'rejected',
    targetLocalId: input.targetLocalId,
    metadataPersisted: input.metadataPersisted,
    originalVerification: input.originalVerification,
    acknowledgementMessageId: acknowledgement.header.messageId,
    acknowledgedMessageIds: acknowledgement.payload.acknowledgedMessageIds,
    error: input.error,
    receivedAt: input.at,
    acknowledgedAt: accepted ? input.at : null,
  };
}

export function appliedMoveItem(
  item: MoveItemRecord,
  acknowledgement: MoveAcknowledgementEnvelope,
  error: unknown,
  at: string,
): MoveItemRecord {
  const accepted = acknowledgement.payload.status === 'accepted';
  return {
    ...item,
    state: accepted ? 'acknowledged' : 'rejected',
    targetLocalId: acknowledgement.payload.targetLocalId,
    metadataPersisted: acknowledgement.payload.metadataPersisted,
    originalVerification: acknowledgement.payload.originalVerification,
    acknowledgementMessageId: acknowledgement.header.messageId,
    acknowledgedMessageIds: acknowledgement.payload.acknowledgedMessageIds,
    error,
    acknowledgedAt: accepted ? at : null,
  };
}

export function receivedMoveAudit(request: MoveRecordEnvelope, input: TargetAcknowledgementInput): StoredMoveAuditEvent {
  return {
    eventKey: `${request.header.messageId}:received`,
    transferId: request.header.transferId,
    interopId: request.payload.record.identity.interopId,
    event: 'received',
    details: { metadataPersisted: input.metadataPersisted, originalVerification: input.originalVerification },
    createdAt: input.at,
  };
}

export function acknowledgementMoveAudit(
  acknowledgement: MoveAcknowledgementEnvelope,
  accepted: boolean,
  at: string,
  ignoredAfterAccepted = false,
): StoredMoveAuditEvent {
  return {
    eventKey: `${acknowledgement.header.messageId}:${accepted ? 'acknowledged' : 'rejected'}`,
    transferId: acknowledgement.header.transferId,
    interopId: acknowledgement.payload.recordInteropId,
    event: accepted ? 'acknowledged' : 'rejected',
    details: { acknowledgementMessageId: acknowledgement.header.messageId, ignoredAfterAccepted },
    createdAt: at,
  };
}

export function moveFinalizationPhase(
  items: readonly MoveItemRecord[],
  state: 'finalizing' | 'finalized' | 'failed',
): InteropTransferPhase {
  if (state === 'failed' || items.some((item) => item.state === 'failed' || item.state === 'rejected')) return 'failed';
  if (items.some((item) => item.acknowledgedAt !== null && item.finalizedAt === null)) return 'finalizing';
  if (items.some((item) => item.state === 'queued')) return 'awaiting-acknowledgement';
  return 'completed';
}
