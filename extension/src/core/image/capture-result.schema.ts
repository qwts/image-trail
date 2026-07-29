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
import { MAX_GIF_WEBP_FRAMES, MAX_GIF_WEBP_LOOP_COUNT, type GifWebpMediaInfo } from './gif-webp-media.js';

export const gifWebpMediaInfoSchema = v.object({
  kind: v.picklist(['gif', 'webp']),
  animated: v.boolean(),
  frameCount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_GIF_WEBP_FRAMES)),
  loopCount: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_GIF_WEBP_LOOP_COUNT))),
});

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

export const captureResultSchema = v.pipe(
  v.variant('status', [
    v.object({
      status: v.literal('captured'),
      blobId: v.string(),
      mimeType: v.string(),
      byteLength: v.number(),
      fileName: v.optional(v.string()),
      width: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
      height: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
      mediaInfo: v.optional(gifWebpMediaInfoSchema),
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
  ]),
  v.check(
    (result) => result.status !== 'captured' || mediaInfoMatchesMimeType(result.mimeType, result.mediaInfo),
    'Media facts must match MIME type.',
  ),
);

export const storedOriginalReferenceSchema = v.pipe(
  v.object({
    blobId: v.string(),
    mimeType: v.string(),
    byteLength: v.number(),
    capturedAt: v.string(),
    fileName: v.optional(v.string()),
    width: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    height: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    mediaInfo: v.optional(gifWebpMediaInfoSchema),
  }),
  v.check((original) => mediaInfoMatchesMimeType(original.mimeType, original.mediaInfo), 'Media facts must match MIME type.'),
);

function mediaInfoMatchesMimeType(mimeType: string, mediaInfo: GifWebpMediaInfo | undefined): boolean {
  return !mediaInfo || mimeType === (mediaInfo.kind === 'gif' ? 'image/gif' : 'image/webp');
}

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
type _AssertGifWebpMediaInfo = Assert<MutuallyAssignable<v.InferOutput<typeof gifWebpMediaInfoSchema>, GifWebpMediaInfo>>;
type _AssertCaptureStatus = Assert<MutuallyAssignable<v.InferOutput<typeof captureStatusSchema>, CaptureStatus>>;
type _AssertCaptureResult = Assert<MutuallyAssignable<v.InferOutput<typeof captureResultSchema>, CaptureResult>>;
type _AssertStoredOriginalReference = Assert<
  MutuallyAssignable<v.InferOutput<typeof storedOriginalReferenceSchema>, StoredOriginalReference>
>;
type _AssertStorageUsageBucketSummary = Assert<
  MutuallyAssignable<v.InferOutput<typeof storageUsageBucketSummarySchema>, StorageUsageBucketSummary>
>;
type _AssertStorageUsageSummary = Assert<MutuallyAssignable<v.InferOutput<typeof storageUsageSummarySchema>, StorageUsageSummary>>;
