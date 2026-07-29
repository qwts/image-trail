import * as v from 'valibot';

import type { StoredOriginalReference } from '../image/capture-result.js';
import { sanitizeFilename } from '../image/downloads.js';
import { MAX_GIF_WEBP_FRAMES, MAX_GIF_WEBP_LOOP_COUNT, type GifWebpKind, type GifWebpMediaInfo } from '../image/gif-webp-media.js';
import { interopJsonObjectSchema, type InteropJsonObject } from './json.js';

export const INTEROP_MEDIA_BLOCK_KEY = 'media';

const interopGifWebpMediaInfoSchema = v.strictObject({
  animated: v.boolean(),
  frameCount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_GIF_WEBP_FRAMES)),
  loopCount: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_GIF_WEBP_LOOP_COUNT))),
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

export type InteropGifWebpMediaBlock = v.InferOutput<typeof interopGifWebpMediaBlockSchema>;

export function interopGifWebpMediaBlockFrom(overlook: InteropJsonObject): InteropGifWebpMediaBlock | null {
  const parsed = v.safeParse(interopGifWebpMediaBlockSchema, overlook[INTEROP_MEDIA_BLOCK_KEY]);
  return parsed.success ? parsed.output : null;
}

export function withInteropGifWebpMediaBlock(overlook: InteropJsonObject, block: InteropGifWebpMediaBlock | null): InteropJsonObject {
  const { [INTEROP_MEDIA_BLOCK_KEY]: _existing, ...rest } = overlook;
  if (block === null) return rest;
  const normalized = v.parse(
    interopJsonObjectSchema,
    JSON.parse(JSON.stringify(v.parse(interopGifWebpMediaBlockSchema, block))) as unknown,
  );
  return { ...rest, [INTEROP_MEDIA_BLOCK_KEY]: normalized };
}

export function interopGifWebpMediaBlockForOriginal(original: StoredOriginalReference | undefined): InteropGifWebpMediaBlock | null {
  const mediaInfo = original?.mediaInfo;
  if (!original || !mediaInfo) return null;
  const expectedMimeType = mediaInfo.kind === 'gif' ? 'image/gif' : 'image/webp';
  if (original.mimeType !== expectedMimeType) return null;
  return {
    schemaVersion: 1,
    kind: mediaInfo.kind,
    mimeType: expectedMimeType,
    extension: originalExtension(original.fileName, mediaInfo.kind),
    mediaInfo: mediaInfoForInterop(mediaInfo),
  };
}

function mediaInfoForInterop(mediaInfo: GifWebpMediaInfo): InteropGifWebpMediaBlock['mediaInfo'] {
  return {
    animated: mediaInfo.animated,
    frameCount: mediaInfo.frameCount,
    loopCount: mediaInfo.loopCount,
  };
}

function originalExtension(fileName: string | undefined, kind: GifWebpKind): GifWebpKind | null {
  const extension = fileName?.match(/\.([a-z0-9]{1,10})$/iu)?.[1]?.toLowerCase();
  return extension === kind ? kind : null;
}

export function interopMediaFileName(candidate: string, fallbackExtension: GifWebpKind): string {
  const sanitized = sanitizeFilename(candidate, `image.${fallbackExtension}`, 240);
  return sanitized.toLowerCase().endsWith(`.${fallbackExtension}`) ? sanitized : `${sanitized}.${fallbackExtension}`;
}
