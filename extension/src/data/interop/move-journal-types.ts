import * as v from 'valibot';
import {
  interopProductSchema,
  interopReviewCategorySchema,
  interopTimestampSchema,
  interopTransferPhaseSchema,
  interopUuidSchema,
  type InteropProduct,
  type InteropReviewCategory,
  type InteropTransferPhase,
} from '../../core/interop/contract.js';
import { interopCountsSchema, interopEnvelopeSchema, type InteropCounts, type InteropEnvelope } from '../../core/interop/messages.js';
import { interopAlbumSchema, interopRecordSchema, type InteropAlbum, type InteropRecord } from '../../core/interop/records.js';

export const moveItemStateSchema = v.picklist(['queued', 'received', 'acknowledged', 'finalizing', 'finalized', 'rejected', 'failed']);
export const moveOriginalVerificationSchema = v.picklist(['pending', 'verified', 'metadata-only', 'unavailable']);
export const moveAuditEventSchema = v.picklist(['queued', 'received', 'acknowledged', 'rejected', 'finalizing', 'finalized', 'failed']);

export type MoveItemState = v.InferOutput<typeof moveItemStateSchema>;
export type MoveOriginalVerification = v.InferOutput<typeof moveOriginalVerificationSchema>;
export type MoveAuditEvent = v.InferOutput<typeof moveAuditEventSchema>;

export interface MoveJournalRecord {
  readonly transferId: string;
  readonly pairingId: string;
  readonly sourceProduct: InteropProduct;
  readonly targetProduct: InteropProduct;
  readonly phase: InteropTransferPhase;
  readonly lastSequence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MoveItemRecord {
  readonly id: string;
  readonly transferId: string;
  readonly interopId: string;
  readonly sourceMessageId: string;
  readonly sourceLocalId: string;
  readonly reviewCategory: InteropReviewCategory;
  readonly record: InteropRecord;
  readonly albums: readonly InteropAlbum[];
  readonly state: MoveItemState;
  readonly targetLocalId: string | null;
  readonly metadataPersisted: boolean;
  readonly originalVerification: MoveOriginalVerification;
  readonly acknowledgementMessageId: string | null;
  readonly acknowledgedMessageIds: readonly string[];
  readonly error: unknown;
  readonly receivedAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly finalizedAt: string | null;
}

export interface MoveOutboxRecord {
  readonly messageId: string;
  readonly transferId: string;
  readonly sequence: number;
  readonly envelope: InteropEnvelope;
  readonly createdAt: string;
  readonly deliveredAt: string | null;
}

export interface MoveReceiptRecord {
  readonly id: string;
  readonly pairingId: string;
  readonly messageId: string;
  readonly transferId: string;
  readonly responseMessageId: string | null;
  readonly receivedAt: string;
}

export interface StoredMoveAuditEvent {
  readonly eventKey: string;
  readonly transferId: string;
  readonly interopId: string | null;
  readonly event: MoveAuditEvent;
  readonly details: unknown;
  readonly createdAt: string;
}

export interface StoredMoveJournal extends MoveJournalRecord {
  readonly counts: InteropCounts;
}

const nullableTimestamp = v.nullable(interopTimestampSchema);
const nullableUuid = v.nullable(interopUuidSchema);

export const moveJournalRecordSchema = v.object({
  transferId: interopUuidSchema,
  pairingId: interopUuidSchema,
  sourceProduct: interopProductSchema,
  targetProduct: interopProductSchema,
  phase: interopTransferPhaseSchema,
  lastSequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  createdAt: interopTimestampSchema,
  updatedAt: interopTimestampSchema,
}) as v.GenericSchema<unknown, MoveJournalRecord>;

export const moveItemRecordSchema = v.object({
  id: v.string(),
  transferId: interopUuidSchema,
  interopId: interopUuidSchema,
  sourceMessageId: interopUuidSchema,
  sourceLocalId: v.pipe(v.string(), v.minLength(1)),
  reviewCategory: interopReviewCategorySchema,
  record: interopRecordSchema,
  albums: v.pipe(v.array(interopAlbumSchema), v.readonly()),
  state: moveItemStateSchema,
  targetLocalId: v.nullable(v.pipe(v.string(), v.minLength(1))),
  metadataPersisted: v.boolean(),
  originalVerification: moveOriginalVerificationSchema,
  acknowledgementMessageId: nullableUuid,
  acknowledgedMessageIds: v.pipe(v.array(interopUuidSchema), v.readonly()),
  error: v.unknown(),
  receivedAt: nullableTimestamp,
  acknowledgedAt: nullableTimestamp,
  finalizedAt: nullableTimestamp,
}) as v.GenericSchema<unknown, MoveItemRecord>;

export const moveOutboxRecordSchema = v.object({
  messageId: interopUuidSchema,
  transferId: interopUuidSchema,
  sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  envelope: interopEnvelopeSchema,
  createdAt: interopTimestampSchema,
  deliveredAt: nullableTimestamp,
}) as v.GenericSchema<unknown, MoveOutboxRecord>;

export const moveReceiptRecordSchema = v.object({
  id: v.string(),
  pairingId: interopUuidSchema,
  messageId: interopUuidSchema,
  transferId: interopUuidSchema,
  responseMessageId: nullableUuid,
  receivedAt: interopTimestampSchema,
}) as v.GenericSchema<unknown, MoveReceiptRecord>;

export const moveAuditRecordSchema = v.object({
  eventKey: v.string(),
  transferId: interopUuidSchema,
  interopId: nullableUuid,
  event: moveAuditEventSchema,
  details: v.unknown(),
  createdAt: interopTimestampSchema,
}) as v.GenericSchema<unknown, StoredMoveAuditEvent>;

export function moveItemId(transferId: string, interopId: string): string {
  return `${transferId}:${interopId}`;
}

export function moveReceiptId(pairingId: string, messageId: string): string {
  return `${pairingId}:${messageId}`;
}

export function emptyInteropCounts(): InteropCounts {
  return {
    total: 0,
    eligible: 0,
    duplicate: 0,
    conflict: 0,
    metadataOnly: 0,
    unsupported: 0,
    skipped: 0,
    failed: 0,
    acknowledged: 0,
    finalized: 0,
  };
}

export function moveCountsFor(items: readonly MoveItemRecord[]): InteropCounts {
  const counts = emptyInteropCounts();
  for (const item of items) {
    counts.total += 1;
    counts[item.reviewCategory === 'metadata-only' ? 'metadataOnly' : item.reviewCategory] += 1;
    if (item.state === 'failed' || item.state === 'rejected') counts.failed += 1;
    if (item.acknowledgedAt !== null) counts.acknowledged += 1;
    if (item.finalizedAt !== null) counts.finalized += 1;
  }
  return v.parse(interopCountsSchema, counts);
}
