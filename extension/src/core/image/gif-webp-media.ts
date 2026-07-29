export type GifWebpKind = 'gif' | 'webp';
export const MAX_GIF_WEBP_FRAMES = 10_000;
export const MAX_GIF_WEBP_LOOP_COUNT = 65_535;

export interface GifWebpMediaInfo {
  readonly kind: GifWebpKind;
  readonly animated: boolean;
  readonly frameCount: number;
  readonly loopCount: number | null;
}

export interface GifWebpInspection {
  readonly status: 'supported';
  readonly mimeType: 'image/gif' | 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly mediaInfo: GifWebpMediaInfo;
}

export type GifWebpInspectionResult =
  | GifWebpInspection
  | { readonly status: 'not-gif-webp' }
  | {
      readonly status: 'invalid';
      readonly reason: 'malformed' | 'probe-limit';
      readonly message: string;
    };

const GIF87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const MAX_PROBED_BLOCKS = 20_000;

interface ParsedMedia {
  readonly width: number;
  readonly height: number;
  readonly animated: boolean;
  readonly frameCount: number;
  readonly loopCount: number | null;
}

type ParseResult =
  | { readonly ok: true; readonly media: ParsedMedia }
  | { readonly ok: false; readonly reason: 'malformed' | 'probe-limit'; readonly message: string };

export function inspectGifWebpMedia(bytesInput: ArrayBuffer | Uint8Array, declaredMimeType = ''): GifWebpInspectionResult {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput);
  const signatureKind = sniffGifWebpKind(bytes);
  const declaredKind = gifWebpKindFromMimeType(declaredMimeType);
  if (signatureKind === null) {
    return declaredKind === null
      ? { status: 'not-gif-webp' }
      : {
          status: 'invalid',
          reason: 'malformed',
          message: `${labelForKind(declaredKind)} data does not match its declared image format.`,
        };
  }

  const parsed = signatureKind === 'gif' ? parseGif(bytes) : parseWebp(bytes);
  if (!parsed.ok) return { status: 'invalid', reason: parsed.reason, message: parsed.message };
  return {
    status: 'supported',
    mimeType: signatureKind === 'gif' ? 'image/gif' : 'image/webp',
    width: parsed.media.width,
    height: parsed.media.height,
    mediaInfo: {
      kind: signatureKind,
      animated: parsed.media.animated,
      frameCount: parsed.media.frameCount,
      loopCount: parsed.media.loopCount,
    },
  };
}

export function gifWebpKindFromMimeType(mimeType: string): GifWebpKind | null {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase();
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/webp') return 'webp';
  return null;
}

function sniffGifWebpKind(bytes: Uint8Array): GifWebpKind | null {
  if (startsWith(bytes, GIF87A) || startsWith(bytes, GIF89A)) return 'gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  return null;
}

function parseGif(bytes: Uint8Array): ParseResult {
  if (bytes.byteLength < 13) return malformed('GIF data is truncated before its logical screen descriptor.');
  const width = u16le(bytes, 6);
  const height = u16le(bytes, 8);
  const packed = bytes[10];
  if (width === null || height === null || width === 0 || height === 0 || packed === undefined) {
    return malformed('GIF dimensions are missing or invalid.');
  }

  let cursor = 13;
  if ((packed & 0x80) !== 0) cursor += 3 * 2 ** ((packed & 0x07) + 1);
  if (cursor > bytes.byteLength) return malformed('GIF color-table data is truncated.');

  let blocks = 0;
  let frames = 0;
  let loopCount: number | null = null;
  while (cursor < bytes.byteLength) {
    blocks += 1;
    if (blocks > MAX_PROBED_BLOCKS) return probeLimit('GIF block count exceeds the bounded inspection limit.');
    const marker = bytes[cursor];
    cursor += 1;
    if (marker === 0x00) continue;
    if (marker === 0x3b) {
      return frames > 0
        ? {
            ok: true,
            media: { width, height, animated: frames > 1, frameCount: frames, loopCount },
          }
        : malformed('GIF data contains no image frames.');
    }
    if (marker === 0x2c) {
      frames += 1;
      if (frames > MAX_GIF_WEBP_FRAMES) return probeLimit('GIF frame count exceeds the bounded inspection limit.');
      if (cursor + 9 > bytes.byteLength) return malformed('GIF image descriptor is truncated.');
      const frameWidth = u16le(bytes, cursor + 4);
      const frameHeight = u16le(bytes, cursor + 6);
      const localPacked = bytes[cursor + 8];
      if (frameWidth === null || frameHeight === null || frameWidth === 0 || frameHeight === 0 || localPacked === undefined) {
        return malformed('GIF frame dimensions are invalid.');
      }
      cursor += 9;
      if ((localPacked & 0x80) !== 0) cursor += 3 * 2 ** ((localPacked & 0x07) + 1);
      const minimumCodeSize = bytes[cursor];
      if (minimumCodeSize === undefined || minimumCodeSize < 2 || minimumCodeSize > 8) {
        return malformed('GIF image data has an invalid LZW code size.');
      }
      const next = skipGifSubBlocks(bytes, cursor + 1);
      if (next === null) return malformed('GIF image data is truncated.');
      cursor = next;
      continue;
    }
    if (marker === 0x21) {
      const label = bytes[cursor];
      if (label === undefined) return malformed('GIF extension data is truncated.');
      cursor += 1;
      if (label === 0xff && bytes[cursor] === 11 && ascii(bytes, cursor + 1, 11) === 'NETSCAPE2.0') {
        const declaredLoopCount = bytes[cursor + 12] === 3 && bytes[cursor + 13] === 1 ? u16le(bytes, cursor + 14) : null;
        if (declaredLoopCount !== null) loopCount = declaredLoopCount;
      }
      const next = skipGifSubBlocks(bytes, cursor);
      if (next === null) return malformed('GIF extension data is truncated.');
      cursor = next;
      continue;
    }
    return malformed('GIF data contains an unknown block marker.');
  }
  return malformed('GIF data is missing its trailer.');
}

function parseWebp(bytes: Uint8Array): ParseResult {
  if (bytes.byteLength < 20) return malformed('WebP data is truncated before its first chunk.');
  const declaredRiffSize = u32le(bytes, 4);
  if (declaredRiffSize === null || declaredRiffSize < 4) return malformed('WebP RIFF size is invalid.');
  const riffEnd = 8 + declaredRiffSize;
  if (riffEnd > bytes.byteLength) return malformed('WebP RIFF data is truncated.');

  let cursor = 12;
  let blocks = 0;
  let frames = 0;
  let hasAnimationHeader = false;
  let animationFlag = false;
  let loopCount: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let stillImageChunks = 0;

  while (cursor < riffEnd) {
    blocks += 1;
    if (blocks > MAX_PROBED_BLOCKS) return probeLimit('WebP chunk count exceeds the bounded inspection limit.');
    if (cursor + 8 > riffEnd) return malformed('WebP chunk header is truncated.');
    const tag = ascii(bytes, cursor, 4);
    const size = u32le(bytes, cursor + 4);
    if (tag === null || size === null) return malformed('WebP chunk header is invalid.');
    const payload = cursor + 8;
    const payloadEnd = payload + size;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > riffEnd) return malformed('WebP chunk payload is truncated.');

    if (tag === 'VP8X') {
      if (size < 10) return malformed('WebP extended header is truncated.');
      const flags = bytes[payload];
      const canvasWidth = u24le(bytes, payload + 4);
      const canvasHeight = u24le(bytes, payload + 7);
      if (flags === undefined || canvasWidth === null || canvasHeight === null) return malformed('WebP canvas metadata is invalid.');
      animationFlag = (flags & 0x02) !== 0;
      width = canvasWidth + 1;
      height = canvasHeight + 1;
    } else if (tag === 'ANIM') {
      if (size < 6) return malformed('WebP animation header is truncated.');
      hasAnimationHeader = true;
      loopCount = u16le(bytes, payload + 4);
    } else if (tag === 'ANMF') {
      if (size < 16) return malformed('WebP animation frame is truncated.');
      frames += 1;
      if (frames > MAX_GIF_WEBP_FRAMES) return probeLimit('WebP frame count exceeds the bounded inspection limit.');
    } else if (tag === 'VP8 ') {
      stillImageChunks += 1;
      const dimensions = vp8Dimensions(bytes, payload, size);
      if (dimensions === null) return malformed('WebP VP8 frame header is invalid.');
      width ??= dimensions.width;
      height ??= dimensions.height;
    } else if (tag === 'VP8L') {
      stillImageChunks += 1;
      const dimensions = vp8lDimensions(bytes, payload, size);
      if (dimensions === null) return malformed('WebP VP8L frame header is invalid.');
      width ??= dimensions.width;
      height ??= dimensions.height;
    }

    const paddedEnd = payloadEnd + (size % 2);
    if (paddedEnd > riffEnd) return malformed('WebP chunk padding is truncated.');
    cursor = paddedEnd;
  }

  if (cursor !== riffEnd) return malformed('WebP RIFF chunk boundaries are invalid.');
  const animated = animationFlag || hasAnimationHeader || frames > 0;
  if (animated && (!hasAnimationHeader || frames === 0)) return malformed('WebP animation metadata is incomplete.');
  if (!animated && stillImageChunks === 0) return malformed('WebP data contains no image frame.');
  if (width === null || height === null || width === 0 || height === 0) return malformed('WebP dimensions are missing or invalid.');
  return {
    ok: true,
    media: {
      width,
      height,
      animated,
      frameCount: animated ? frames : 1,
      loopCount: animated ? loopCount : null,
    },
  };
}

function skipGifSubBlocks(bytes: Uint8Array, offset: number): number | null {
  let cursor = offset;
  let blocks = 0;
  for (;;) {
    blocks += 1;
    if (blocks > MAX_PROBED_BLOCKS) return null;
    const size = bytes[cursor];
    if (size === undefined) return null;
    cursor += 1;
    if (size === 0) return cursor;
    cursor += size;
    if (cursor > bytes.byteLength) return null;
  }
}

function vp8Dimensions(bytes: Uint8Array, payload: number, size: number): { readonly width: number; readonly height: number } | null {
  if (size < 10 || bytes[payload + 3] !== 0x9d || bytes[payload + 4] !== 0x01 || bytes[payload + 5] !== 0x2a) return null;
  const rawWidth = u16le(bytes, payload + 6);
  const rawHeight = u16le(bytes, payload + 8);
  if (rawWidth === null || rawHeight === null) return null;
  const width = rawWidth & 0x3fff;
  const height = rawHeight & 0x3fff;
  return width > 0 && height > 0 ? { width, height } : null;
}

function vp8lDimensions(bytes: Uint8Array, payload: number, size: number): { readonly width: number; readonly height: number } | null {
  if (size < 5 || bytes[payload] !== 0x2f) return null;
  const b1 = bytes[payload + 1];
  const b2 = bytes[payload + 2];
  const b3 = bytes[payload + 3];
  const b4 = bytes[payload + 4];
  if (b1 === undefined || b2 === undefined || b3 === undefined || b4 === undefined) return null;
  return {
    width: 1 + (((b2 & 0x3f) << 8) | b1),
    height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | (b2 >> 6)),
  };
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return bytes.byteLength >= prefix.length && prefix.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string | null {
  if (offset < 0 || bytes.byteLength < offset + length) return null;
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16le(bytes: Uint8Array, offset: number): number | null {
  const low = bytes[offset];
  const high = bytes[offset + 1];
  return low === undefined || high === undefined ? null : low | (high << 8);
}

function u24le(bytes: Uint8Array, offset: number): number | null {
  const low = bytes[offset];
  const middle = bytes[offset + 1];
  const high = bytes[offset + 2];
  return low === undefined || middle === undefined || high === undefined ? null : low | (middle << 8) | (high << 16);
}

function u32le(bytes: Uint8Array, offset: number): number | null {
  const low = u16le(bytes, offset);
  const high = u16le(bytes, offset + 2);
  return low === null || high === null ? null : low + high * 0x1_0000;
}

function malformed(message: string): ParseResult {
  return { ok: false, reason: 'malformed', message };
}

function probeLimit(message: string): ParseResult {
  return { ok: false, reason: 'probe-limit', message };
}

function labelForKind(kind: GifWebpKind): 'GIF' | 'WebP' {
  return kind === 'gif' ? 'GIF' : 'WebP';
}
