import * as v from 'valibot';

export const INTEROP_MAGIC = 'OVERLOOK-IMAGE-TRAIL-INTEROP';
export const INTEROP_CONTRACT_VERSION = 1;

export const interopProductSchema = v.picklist(['image-trail', 'overlook']);
export const interopOperationSchema = v.picklist(['move', 'sync']);
export const interopMessageKindSchema = v.picklist(['manifest', 'record', 'blob', 'acknowledgement', 'journal', 'error']);
export const interopReviewCategorySchema = v.picklist(['eligible', 'duplicate', 'conflict', 'metadata-only', 'unsupported', 'skipped']);
export const interopConflictActionSchema = v.picklist(['keep-image-trail', 'keep-overlook', 'keep-both']);
export const interopTransferPhaseSchema = v.picklist([
  'queued',
  'reviewing',
  'transferring',
  'paused',
  'awaiting-acknowledgement',
  'acknowledged',
  'finalizing',
  'completed',
  'cancelled',
  'failed',
]);
export const interopErrorCodeSchema = v.picklist([
  'offline',
  'auth-expired',
  'quota',
  'provider-unavailable',
  'partial-failure',
  'interrupted',
  'wrong-key',
  'corrupt',
  'replay',
  'unsupported-version',
  'unsupported-record',
]);

const nonNegativeIntegerSchema = v.pipe(v.number(), v.finite(), v.integer(), v.minValue(0));
export const sha256Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u));
export const interopUuidSchema = v.pipe(
  v.string(),
  v.regex(
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/iu,
  ),
);
export const interopTimestampSchema = v.pipe(v.string(), v.isoTimestamp());

export const interopRevisionVectorSchema = v.strictObject({
  imageTrail: nonNegativeIntegerSchema,
  overlook: nonNegativeIntegerSchema,
});

export const interopFieldRevisionsSchema = v.strictObject({
  title: v.optional(interopRevisionVectorSchema),
  label: v.optional(interopRevisionVectorSchema),
  sourceUrl: v.optional(interopRevisionVectorSchema),
  dimensions: v.optional(interopRevisionVectorSchema),
  thumbnail: v.optional(interopRevisionVectorSchema),
  timestamps: v.optional(interopRevisionVectorSchema),
  original: v.optional(interopRevisionVectorSchema),
  albums: v.optional(interopRevisionVectorSchema),
  sourceCompatibility: v.optional(interopRevisionVectorSchema),
  roundTripMetadata: v.optional(interopRevisionVectorSchema),
  deleted: v.optional(interopRevisionVectorSchema),
});

export const interopIdentitySchema = v.strictObject({
  interopId: interopUuidSchema,
  origin: v.strictObject({
    product: interopProductSchema,
    localId: v.pipe(v.string(), v.minLength(1)),
  }),
  contentHash: v.nullable(sha256Schema),
});

export const interopHeaderSchema = v.pipe(
  v.strictObject({
    magic: v.literal(INTEROP_MAGIC),
    contractVersion: v.literal(INTEROP_CONTRACT_VERSION),
    messageId: interopUuidSchema,
    transferId: interopUuidSchema,
    pairingId: interopUuidSchema,
    sourceProduct: interopProductSchema,
    targetProduct: interopProductSchema,
    operation: interopOperationSchema,
    kind: interopMessageKindSchema,
    createdAt: interopTimestampSchema,
    sequence: nonNegativeIntegerSchema,
  }),
  v.check((header) => header.sourceProduct !== header.targetProduct, 'Source and target products must differ.'),
);

export type InteropProduct = v.InferOutput<typeof interopProductSchema>;
export type InteropOperation = v.InferOutput<typeof interopOperationSchema>;
export type InteropReviewCategory = v.InferOutput<typeof interopReviewCategorySchema>;
export type InteropConflictAction = v.InferOutput<typeof interopConflictActionSchema>;
export type InteropTransferPhase = v.InferOutput<typeof interopTransferPhaseSchema>;
export type InteropErrorCode = v.InferOutput<typeof interopErrorCodeSchema>;
export type InteropRevisionVector = v.InferOutput<typeof interopRevisionVectorSchema>;
export type InteropFieldRevisions = v.InferOutput<typeof interopFieldRevisionsSchema>;
export type InteropIdentity = v.InferOutput<typeof interopIdentitySchema>;
export type InteropHeader = v.InferOutput<typeof interopHeaderSchema>;

export type InteropRevisionRelation = 'equal' | 'before' | 'after' | 'concurrent';

export function compareInteropRevisions(left: InteropRevisionVector, right: InteropRevisionVector): InteropRevisionRelation {
  const leftBeforeOrEqual = left.imageTrail <= right.imageTrail && left.overlook <= right.overlook;
  const rightBeforeOrEqual = right.imageTrail <= left.imageTrail && right.overlook <= left.overlook;
  if (leftBeforeOrEqual && rightBeforeOrEqual) return 'equal';
  if (leftBeforeOrEqual) return 'before';
  if (rightBeforeOrEqual) return 'after';
  return 'concurrent';
}

export function incrementInteropRevision(revision: InteropRevisionVector, product: InteropProduct): InteropRevisionVector {
  return product === 'image-trail'
    ? { imageTrail: revision.imageTrail + 1, overlook: revision.overlook }
    : { imageTrail: revision.imageTrail, overlook: revision.overlook + 1 };
}

export function mergeInteropRevisions(left: InteropRevisionVector, right: InteropRevisionVector): InteropRevisionVector {
  return {
    imageTrail: Math.max(left.imageTrail, right.imageTrail),
    overlook: Math.max(left.overlook, right.overlook),
  };
}
