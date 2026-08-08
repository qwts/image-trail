import * as v from 'valibot';

import type { StoredOriginalReference } from '../image/capture-result.js';
import { sanitizeFilename } from '../image/downloads.js';
import { MAX_GIF_WEBP_FRAMES, MAX_GIF_WEBP_LOOP_COUNT, type GifWebpKind, type GifWebpMediaInfo } from '../image/gif-webp-media.js';
import { MAX_MPEG_TS_DURATION_SECONDS, MAX_MPEG_TS_STREAMS, type MpegTsMediaInfo, type MpegTsStreamInfo } from '../media/mpeg-ts.js';
import {
  MAX_COMMON_MEDIA_DIMENSION,
  MAX_COMMON_MEDIA_DURATION_SECONDS,
  MAX_COMMON_MEDIA_STREAMS,
  type CommonMediaInfo,
  type CommonMediaStreamInfo,
} from '../media/common-media-types.js';
import { interopJsonObjectSchema, type InteropJsonObject } from './json.js';

export const INTEROP_MEDIA_BLOCK_KEY = 'media';

const interopGifWebpMediaInfoSchema = v.strictObject({
  animated: v.boolean(),
  frameCount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_GIF_WEBP_FRAMES)),
  loopCount: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_GIF_WEBP_LOOP_COUNT))),
});

const interopMpegTsStreamSchema = v.strictObject({
  type: v.picklist(['video', 'audio']),
  codec: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  profile: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
});

const interopMpegTsMediaInfoSchema = v.strictObject({
  animated: v.literal(false),
  frameCount: v.null(),
  loopCount: v.null(),
  container: v.literal('MPEG-TS'),
  streams: v.pipe(v.array(interopMpegTsStreamSchema), v.maxLength(MAX_MPEG_TS_STREAMS), v.readonly()),
  durationSeconds: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_MPEG_TS_DURATION_SECONDS))),
  codedWidth: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  codedHeight: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  displayWidth: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  displayHeight: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  rotationDegrees: v.nullable(v.picklist([0, 90, 180, 270] as const)),
  frameRate: v.nullable(v.pipe(v.number(), v.minValue(0))),
  variableFrameRate: v.boolean(),
  audioPresent: v.boolean(),
  hdr: v.nullable(v.boolean()),
  colorTransfer: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  probeIncomplete: v.boolean(),
});

export const interopGifWebpMediaBlockSchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(1),
    kind: v.picklist(['gif', 'webp']),
    mimeType: v.picklist(['image/gif', 'image/webp']),
    extension: v.nullable(v.picklist(['gif', 'webp'])),
    mediaInfo: interopGifWebpMediaInfoSchema,
  }),
  v.check(
    (block) =>
      block.mimeType === (block.kind === 'gif' ? 'image/gif' : 'image/webp') &&
      (block.extension === null || block.extension === block.kind),
    'Media kind, MIME type, and extension must agree.',
  ),
);

export const interopMpegTsMediaBlockSchema = v.strictObject({
  schemaVersion: v.literal(1),
  kind: v.literal('video'),
  mimeType: v.literal('video/mp2t'),
  extension: v.nullable(v.picklist(['ts', 'mts', 'm2ts'])),
  mediaInfo: v.nullable(interopMpegTsMediaInfoSchema),
});

const interopCommonMediaStreamSchema = v.strictObject({
  type: v.picklist(['video', 'audio', 'text', 'unknown']),
  codec: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  profile: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  level: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(40))),
  bitDepth: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(64))),
  channels: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(64))),
  sampleRate: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(768_000))),
  language: v.nullable(v.pipe(v.string(), v.minLength(2), v.maxLength(40))),
});

const interopCommonMediaInfoSchema = v.strictObject({
  animated: v.literal(false),
  frameCount: v.null(),
  loopCount: v.null(),
  container: v.picklist(['ISO-BMFF', 'QuickTime', 'WebM', 'Matroska', 'AVI', 'MPEG-PS', 'MPEG-Audio']),
  streams: v.pipe(v.array(interopCommonMediaStreamSchema), v.minLength(1), v.maxLength(MAX_COMMON_MEDIA_STREAMS), v.readonly()),
  durationSeconds: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_COMMON_MEDIA_DURATION_SECONDS))),
  codedWidth: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_COMMON_MEDIA_DIMENSION))),
  codedHeight: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_COMMON_MEDIA_DIMENSION))),
  displayWidth: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_COMMON_MEDIA_DIMENSION))),
  displayHeight: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_COMMON_MEDIA_DIMENSION))),
  rotationDegrees: v.nullable(v.picklist([0, 90, 180, 270] as const)),
  frameRate: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(1_000))),
  variableFrameRate: v.nullable(v.boolean()),
  audioPresent: v.boolean(),
  hdr: v.nullable(v.boolean()),
  colorTransfer: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  probeIncomplete: v.boolean(),
});

export const interopCommonMediaBlockSchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(1),
    kind: v.picklist(['video', 'audio']),
    mimeType: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
    extension: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(10))),
    mediaInfo: interopCommonMediaInfoSchema,
  }),
  v.check(
    (block) => commonInteropMimeMatches(block.kind, block.mimeType, block.mediaInfo.container),
    'Common media kind, MIME type, and container must agree.',
  ),
);

export const interopMediaBlockSchema = v.union([
  interopGifWebpMediaBlockSchema,
  interopMpegTsMediaBlockSchema,
  interopCommonMediaBlockSchema,
]);

export type InteropGifWebpMediaBlock = v.InferOutput<typeof interopGifWebpMediaBlockSchema>;
export type InteropMpegTsMediaBlock = v.InferOutput<typeof interopMpegTsMediaBlockSchema>;
export type InteropCommonMediaBlock = v.InferOutput<typeof interopCommonMediaBlockSchema>;
export type InteropMediaBlock = v.InferOutput<typeof interopMediaBlockSchema>;

export function interopMediaBlockFrom(overlook: InteropJsonObject): InteropMediaBlock | null {
  const parsed = v.safeParse(interopMediaBlockSchema, overlook[INTEROP_MEDIA_BLOCK_KEY]);
  return parsed.success ? parsed.output : null;
}

export function interopGifWebpMediaBlockFrom(overlook: InteropJsonObject): InteropGifWebpMediaBlock | null {
  const parsed = v.safeParse(interopGifWebpMediaBlockSchema, overlook[INTEROP_MEDIA_BLOCK_KEY]);
  return parsed.success ? parsed.output : null;
}

export function withInteropMediaBlock(overlook: InteropJsonObject, block: InteropMediaBlock | null): InteropJsonObject {
  const { [INTEROP_MEDIA_BLOCK_KEY]: _existing, ...rest } = overlook;
  if (block === null) return rest;
  const normalized = v.parse(interopJsonObjectSchema, JSON.parse(JSON.stringify(v.parse(interopMediaBlockSchema, block))) as unknown);
  return { ...rest, [INTEROP_MEDIA_BLOCK_KEY]: normalized };
}

export function withInteropGifWebpMediaBlock(overlook: InteropJsonObject, block: InteropGifWebpMediaBlock | null): InteropJsonObject {
  return withInteropMediaBlock(overlook, block);
}

export function interopMediaBlockForOriginal(original: StoredOriginalReference | undefined): InteropMediaBlock | null {
  const mediaInfo = original?.mediaInfo;
  if (!original || !mediaInfo) return null;
  if (mediaInfo.kind === 'mpeg-ts') {
    if (original.mimeType !== 'video/mp2t') return null;
    return {
      schemaVersion: 1,
      kind: 'video',
      mimeType: 'video/mp2t',
      extension: transportStreamExtension(original.fileName),
      mediaInfo: mediaInfoForMpegTsInterop(mediaInfo),
    };
  }
  if (mediaInfo.kind === 'common-media') {
    return {
      schemaVersion: 1,
      kind: mediaInfo.mediaKind,
      mimeType: original.mimeType,
      extension: originalMediaExtension(original.fileName),
      mediaInfo: mediaInfoForCommonInterop(mediaInfo),
    };
  }
  return interopGifWebpMediaBlockForOriginal(original);
}

export function interopGifWebpMediaBlockForOriginal(original: StoredOriginalReference | undefined): InteropGifWebpMediaBlock | null {
  const mediaInfo = original?.mediaInfo;
  if (!original || !mediaInfo || mediaInfo.kind === 'mpeg-ts' || mediaInfo.kind === 'common-media') return null;
  const expectedMimeType = mediaInfo.kind === 'gif' ? 'image/gif' : 'image/webp';
  if (original.mimeType !== expectedMimeType) return null;
  return {
    schemaVersion: 1,
    kind: mediaInfo.kind,
    mimeType: expectedMimeType,
    extension: gifWebpExtension(original.fileName, mediaInfo.kind),
    mediaInfo: mediaInfoForGifWebpInterop(mediaInfo),
  };
}

function mediaInfoForGifWebpInterop(mediaInfo: GifWebpMediaInfo): InteropGifWebpMediaBlock['mediaInfo'] {
  return {
    animated: mediaInfo.animated,
    frameCount: mediaInfo.frameCount,
    loopCount: mediaInfo.loopCount,
  };
}

function mediaInfoForMpegTsInterop(mediaInfo: MpegTsMediaInfo): InteropMpegTsMediaBlock['mediaInfo'] {
  if (mediaInfo.streams.some((stream) => stream.type === 'unknown')) return null;
  return {
    animated: false,
    frameCount: null,
    loopCount: null,
    container: 'MPEG-TS',
    streams: mediaInfo.streams as readonly (MpegTsStreamInfo & { readonly type: 'video' | 'audio' })[],
    durationSeconds: mediaInfo.durationSeconds,
    codedWidth: mediaInfo.codedWidth,
    codedHeight: mediaInfo.codedHeight,
    displayWidth: mediaInfo.displayWidth,
    displayHeight: mediaInfo.displayHeight,
    rotationDegrees: mediaInfo.rotationDegrees,
    frameRate: mediaInfo.frameRate,
    variableFrameRate: mediaInfo.variableFrameRate,
    audioPresent: mediaInfo.audioPresent,
    hdr: mediaInfo.hdr,
    colorTransfer: mediaInfo.colorTransfer,
    probeIncomplete: mediaInfo.probeIncomplete,
  };
}

function mediaInfoForCommonInterop(mediaInfo: CommonMediaInfo): InteropCommonMediaBlock['mediaInfo'] {
  return {
    animated: false,
    frameCount: null,
    loopCount: null,
    container: mediaInfo.container,
    streams: mediaInfo.streams as readonly CommonMediaStreamInfo[],
    durationSeconds: mediaInfo.durationSeconds,
    codedWidth: mediaInfo.codedWidth,
    codedHeight: mediaInfo.codedHeight,
    displayWidth: mediaInfo.displayWidth,
    displayHeight: mediaInfo.displayHeight,
    rotationDegrees: mediaInfo.rotationDegrees,
    frameRate: mediaInfo.frameRate,
    variableFrameRate: mediaInfo.variableFrameRate,
    audioPresent: mediaInfo.audioPresent,
    hdr: mediaInfo.hdr,
    colorTransfer: mediaInfo.colorTransfer,
    probeIncomplete: mediaInfo.probeIncomplete,
  };
}

function gifWebpExtension(fileName: string | undefined, kind: GifWebpKind): GifWebpKind | null {
  const extension = fileName?.match(/\.([a-z0-9]{1,10})$/iu)?.[1]?.toLowerCase();
  return extension === kind ? kind : null;
}

function transportStreamExtension(fileName: string | undefined): 'ts' | 'mts' | 'm2ts' | null {
  const extension = fileName?.match(/\.([a-z0-9]{1,10})$/iu)?.[1]?.toLowerCase();
  return extension === 'ts' || extension === 'mts' || extension === 'm2ts' ? extension : null;
}

function originalMediaExtension(fileName: string | undefined): string | null {
  return fileName?.match(/\.([a-z0-9]{1,10})$/iu)?.[1]?.toLowerCase() ?? null;
}

function commonInteropMimeMatches(kind: 'video' | 'audio', mimeType: string, container: CommonMediaInfo['container']): boolean {
  if (container === 'ISO-BMFF') return mimeType === (kind === 'audio' ? 'audio/mp4' : 'video/mp4');
  if (container === 'QuickTime') return mimeType === 'video/quicktime';
  if (container === 'WebM') return mimeType === (kind === 'audio' ? 'audio/webm' : 'video/webm');
  if (container === 'Matroska') return mimeType === (kind === 'audio' ? 'audio/x-matroska' : 'video/x-matroska');
  if (container === 'AVI') return mimeType === (kind === 'audio' ? 'audio/x-msvideo' : 'video/x-msvideo');
  return mimeType === (kind === 'audio' ? 'audio/mpeg' : 'video/mpeg');
}

export function interopMediaFileName(candidate: string, fallbackExtension: string): string {
  const safeExtension = /^(?:gif|webp|ts|mts|m2ts|mp4|m4v|m4a|mpeg4|mov|qt|webm|weba|mkv|mka|avi|mpg|mpeg|mp2)$/u.test(fallbackExtension)
    ? fallbackExtension
    : 'bin';
  const fallbackBase = safeExtension === 'gif' || safeExtension === 'webp' ? 'image' : 'media';
  const sanitized = sanitizeFilename(candidate, `${fallbackBase}.${safeExtension}`, 240);
  return sanitized.toLowerCase().endsWith(`.${safeExtension}`) ? sanitized : `${sanitized}.${safeExtension}`;
}
