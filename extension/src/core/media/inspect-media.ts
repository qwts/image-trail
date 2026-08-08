import { inspectGifWebpMedia } from '../image/gif-webp-media.js';
import { inspectCommonMedia, isNativePlaybackCandidate } from './common-media.js';
import type { StoredMediaInfo } from './media-info.js';
import { detectTsLayout, inspectMpegTsMedia } from './mpeg-ts.js';

export interface SpecializedMediaInspection {
  readonly status: 'supported';
  readonly mimeType: string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly mediaInfo: StoredMediaInfo;
  readonly playbackTier?: 'playable' | 'preserved-only' | undefined;
  readonly extension?: string | undefined;
}

export type SpecializedMediaInspectionResult =
  | SpecializedMediaInspection
  | { readonly status: 'unclassified' }
  | {
      readonly status: 'invalid';
      readonly reason: 'malformed' | 'probe-limit';
      readonly message: string;
    };

export function inspectSpecializedMedia(
  bytesInput: ArrayBuffer | Uint8Array,
  declaredMimeType = '',
  fileNameOrUrl = '',
): SpecializedMediaInspectionResult {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput);

  if (detectTsLayout(bytes) !== null) {
    const transportStream = inspectMpegTsMedia(bytes, declaredMimeType, fileNameOrUrl);
    if (transportStream.status === 'invalid') return transportStream;
    if (transportStream.status !== 'not-mpeg-ts') {
      return {
        status: 'supported',
        mimeType: transportStream.mimeType,
        width: transportStream.mediaInfo.displayWidth ?? transportStream.mediaInfo.codedWidth ?? undefined,
        height: transportStream.mediaInfo.displayHeight ?? transportStream.mediaInfo.codedHeight ?? undefined,
        mediaInfo: transportStream.mediaInfo,
        playbackTier: transportStream.status,
        extension: transportStream.extension,
      };
    }
  }

  const common = inspectCommonMedia(bytes, declaredMimeType, fileNameOrUrl);
  if (common.status === 'invalid') return common;
  if (common.status === 'supported') {
    const { probe } = common;
    return {
      status: 'supported',
      mimeType: probe.mimeType,
      width: probe.mediaInfo.displayWidth ?? probe.mediaInfo.codedWidth ?? undefined,
      height: probe.mediaInfo.displayHeight ?? probe.mediaInfo.codedHeight ?? undefined,
      mediaInfo: probe.mediaInfo,
      playbackTier: isNativePlaybackCandidate(probe.mediaInfo) ? 'playable' : 'preserved-only',
      extension: probe.extension,
    };
  }

  const gifWebp = inspectGifWebpMedia(bytes);
  if (gifWebp.status === 'supported') {
    return {
      status: 'supported',
      mimeType: gifWebp.mimeType,
      width: gifWebp.width,
      height: gifWebp.height,
      mediaInfo: gifWebp.mediaInfo,
    };
  }
  if (gifWebp.status === 'invalid') return gifWebp;

  const declaredGifWebp = inspectGifWebpMedia(bytes, declaredMimeType);
  if (declaredGifWebp.status === 'invalid') return declaredGifWebp;

  const declaredTransportStream = inspectMpegTsMedia(bytes, declaredMimeType, fileNameOrUrl);
  if (declaredTransportStream.status === 'invalid') return declaredTransportStream;
  return { status: 'unclassified' };
}
