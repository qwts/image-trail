export const MAX_COMMON_MEDIA_STREAMS = 32;
export const MAX_COMMON_MEDIA_DURATION_SECONDS = 7 * 24 * 60 * 60;
export const MAX_COMMON_MEDIA_DIMENSION = 16_384;
export const MAX_COMMON_MEDIA_BIT_DEPTH = 64;
export const MAX_COMMON_MEDIA_CHANNELS = 64;
export const MAX_COMMON_MEDIA_SAMPLE_RATE = 768_000;
export const MAX_COMMON_MEDIA_PROBE_BYTES = 4 * 1024 * 1024;
export const MAX_COMMON_MEDIA_ELEMENTS = 4_096;

export type CommonMediaContainer = 'ISO-BMFF' | 'QuickTime' | 'WebM' | 'Matroska' | 'AVI' | 'MPEG-PS' | 'MPEG-Audio';
export type CommonMediaKind = 'video' | 'audio';
export type CommonMediaStreamType = 'video' | 'audio' | 'text' | 'unknown';

export interface CommonMediaStreamInfo {
  readonly type: CommonMediaStreamType;
  readonly codec: string | null;
  readonly profile: string | null;
  readonly level: string | null;
  readonly bitDepth: number | null;
  readonly channels: number | null;
  readonly sampleRate: number | null;
  readonly language: string | null;
}

export interface CommonMediaInfo {
  readonly kind: 'common-media';
  readonly mediaKind: CommonMediaKind;
  readonly animated: false;
  readonly frameCount: null;
  readonly loopCount: null;
  readonly container: CommonMediaContainer;
  readonly streams: readonly CommonMediaStreamInfo[];
  readonly durationSeconds: number | null;
  readonly codedWidth: number | null;
  readonly codedHeight: number | null;
  readonly displayWidth: number | null;
  readonly displayHeight: number | null;
  readonly rotationDegrees: 0 | 90 | 180 | 270 | null;
  readonly frameRate: number | null;
  readonly variableFrameRate: boolean | null;
  readonly audioPresent: boolean;
  readonly hdr: boolean | null;
  readonly colorTransfer: string | null;
  readonly probeIncomplete: boolean;
}

export interface CommonMediaProbe {
  readonly mimeType: string;
  readonly extension: string;
  readonly mediaInfo: CommonMediaInfo;
}

export type CommonMediaProbeResult =
  | { readonly status: 'supported'; readonly probe: CommonMediaProbe }
  | { readonly status: 'not-common-media' }
  | {
      readonly status: 'invalid';
      readonly reason: 'malformed' | 'probe-limit';
      readonly message: string;
    };

export function commonMediaDimensions(
  width: number | null,
  height: number | null,
  rotation: CommonMediaInfo['rotationDegrees'],
): Pick<CommonMediaInfo, 'codedWidth' | 'codedHeight' | 'displayWidth' | 'displayHeight'> {
  const validWidth = validDimension(width);
  const validHeight = validDimension(height);
  const rotated = rotation === 90 || rotation === 270;
  return {
    codedWidth: validWidth,
    codedHeight: validHeight,
    displayWidth: rotated ? validHeight : validWidth,
    displayHeight: rotated ? validWidth : validHeight,
  };
}

export function boundedDuration(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= MAX_COMMON_MEDIA_DURATION_SECONDS ? value : null;
}

export function boundedFrameRate(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 && value <= 1_000 ? value : null;
}

export function boundedBitDepth(value: number | null): number | null {
  return boundedPositiveInteger(value, MAX_COMMON_MEDIA_BIT_DEPTH);
}

export function boundedChannels(value: number | null): number | null {
  return boundedPositiveInteger(value, MAX_COMMON_MEDIA_CHANNELS);
}

export function boundedSampleRate(value: number | null): number | null {
  return boundedPositiveInteger(value, MAX_COMMON_MEDIA_SAMPLE_RATE);
}

function validDimension(value: number | null): number | null {
  return boundedPositiveInteger(value, MAX_COMMON_MEDIA_DIMENSION);
}

function boundedPositiveInteger(value: number | null, maximum: number): number | null {
  return value !== null && Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
}
