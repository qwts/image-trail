import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from '../schema-assert.js';
import type {
  CaptureFailureReason,
  CaptureResult,
  CaptureStatus,
  StorageUsageBucketSummary,
  StorageUsageSummary,
  StoredOriginalReference,
} from './capture-result.js';

export const captureFailureReasonSchema = v.picklist([
  'permission-needed',
  'fetch-forbidden',
  'not-image',
  'too-large',
  'network-error',
  'auth-required',
  'canvas-tainted',
  'encryption-locked',
  'unknown',
]);

export const captureStatusSchema = v.picklist(['captured', 'remote-only', 'failed']);

export const captureResultSchema = v.variant('status', [
  v.object({
    status: v.literal('captured'),
    blobId: v.string(),
    mimeType: v.string(),
    byteLength: v.number(),
  }),
  v.object({
    status: v.literal('remote-only'),
    reason: captureFailureReasonSchema,
    message: v.string(),
    origin: v.optional(v.string()),
  }),
  v.object({
    status: v.literal('failed'),
    reason: captureFailureReasonSchema,
    message: v.string(),
    origin: v.optional(v.string()),
  }),
]);

export const storedOriginalReferenceSchema = v.object({
  blobId: v.string(),
  mimeType: v.string(),
  byteLength: v.number(),
  capturedAt: v.string(),
});

export const storageUsageBucketSummarySchema = v.object({
  count: v.number(),
  totalBytes: v.number(),
});

export const storageUsageSummarySchema = v.object({
  blobCount: v.number(),
  totalBytes: v.number(),
  orphanedBlobCount: v.optional(v.number()),
  originals: v.optional(storageUsageBucketSummarySchema),
  queueRecords: v.optional(storageUsageBucketSummarySchema),
  thumbnails: v.optional(storageUsageBucketSummarySchema),
});

type _AssertCaptureFailureReason = Assert<MutuallyAssignable<v.InferOutput<typeof captureFailureReasonSchema>, CaptureFailureReason>>;
type _AssertCaptureStatus = Assert<MutuallyAssignable<v.InferOutput<typeof captureStatusSchema>, CaptureStatus>>;
type _AssertCaptureResult = Assert<MutuallyAssignable<v.InferOutput<typeof captureResultSchema>, CaptureResult>>;
type _AssertStoredOriginalReference = Assert<
  MutuallyAssignable<v.InferOutput<typeof storedOriginalReferenceSchema>, StoredOriginalReference>
>;
type _AssertStorageUsageBucketSummary = Assert<
  MutuallyAssignable<v.InferOutput<typeof storageUsageBucketSummarySchema>, StorageUsageBucketSummary>
>;
type _AssertStorageUsageSummary = Assert<MutuallyAssignable<v.InferOutput<typeof storageUsageSummarySchema>, StorageUsageSummary>>;
