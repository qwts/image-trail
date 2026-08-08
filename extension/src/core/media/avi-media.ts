import { BoundedMediaReader, normalizedFileExtension, safeRatio, type ByteRange } from './binary-media-probe.js';
import {
  boundedBitDepth,
  boundedChannels,
  boundedDuration,
  boundedFrameRate,
  boundedSampleRate,
  commonMediaDimensions,
  MAX_COMMON_MEDIA_STREAMS,
  type CommonMediaInfo,
  type CommonMediaProbeResult,
  type CommonMediaStreamInfo,
} from './common-media-types.js';

interface RiffChunk extends ByteRange {
  readonly id: string;
  readonly dataStart: number;
  readonly listType: string | null;
}

interface AviStream {
  readonly stream: CommonMediaStreamInfo;
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly frameRate: number | null;
  readonly complete: boolean;
}

export function inspectAviMedia(bytes: Uint8Array, _declaredMimeType = '', fileNameOrUrl = ''): CommonMediaProbeResult {
  const reader = new BoundedMediaReader(bytes);
  if (reader.ascii(0, 4) !== 'RIFF' || reader.ascii(8, 4) !== 'AVI ') return { status: 'not-common-media' };
  const declaredSize = reader.uint32(4, true);
  if (declaredSize === null || declaredSize < 4 || declaredSize + 8 > bytes.byteLength) {
    return invalid('AVI RIFF size is truncated or malformed.');
  }
  const rootEnd = Math.min(bytes.byteLength, declaredSize + 8);
  const rootChunks = readChunks(reader, { start: 12, end: rootEnd });
  if (reader.probeLimitExceeded) return invalid('AVI metadata exceeds the bounded element limit.', true);
  const headerList = rootChunks.find((chunk) => chunk.id === 'LIST' && chunk.listType === 'hdrl');
  if (!headerList) return invalid('AVI header list is missing.');
  const headerChunks = readChunks(reader, { start: headerList.dataStart + 4, end: headerList.end });
  const mainHeader = headerChunks.find((chunk) => chunk.id === 'avih');
  const allStreamLists = headerChunks.filter((chunk) => chunk.id === 'LIST' && chunk.listType === 'strl');
  const streamLimitExceeded = allStreamLists.length > MAX_COMMON_MEDIA_STREAMS;
  const streamLists = allStreamLists.slice(0, MAX_COMMON_MEDIA_STREAMS);
  const streams = streamLists.map((chunk) => parseStream(reader, chunk)).filter((stream): stream is AviStream => stream !== null);
  if (reader.probeLimitExceeded) return invalid('AVI metadata exceeds the bounded element limit.', true);
  if (streams.length === 0) return invalid('AVI does not contain a valid audio or video stream header.');
  const movi = rootChunks.find((chunk) => chunk.id === 'LIST' && chunk.listType === 'movi');
  if (!movi) return invalid('AVI media data is missing.');
  const video = streams.find((stream) => stream.stream.type === 'video') ?? null;
  const main = parseMainHeader(reader, mainHeader);
  const durationSeconds = boundedDuration(
    main.durationSeconds ?? streams.reduce<number | null>((maximum, stream) => Math.max(maximum ?? 0, stream.durationSeconds ?? 0), null),
  );
  const dimensions = commonMediaDimensions(video?.width ?? main.width, video?.height ?? main.height, 0);
  const mediaInfo: CommonMediaInfo = {
    kind: 'common-media',
    mediaKind: video ? 'video' : 'audio',
    animated: false,
    frameCount: null,
    loopCount: null,
    container: 'AVI',
    streams: streams.map((stream) => stream.stream),
    durationSeconds,
    ...dimensions,
    rotationDegrees: video ? 0 : null,
    frameRate: boundedFrameRate(video?.frameRate ?? main.frameRate),
    variableFrameRate: video?.frameRate ? false : null,
    audioPresent: streams.some((stream) => stream.stream.type === 'audio'),
    hdr: null,
    colorTransfer: null,
    probeIncomplete: streamLimitExceeded || streams.some((stream) => !stream.complete),
  };
  const extension = normalizedFileExtension(fileNameOrUrl);
  return {
    status: 'supported',
    probe: {
      mimeType: video ? 'video/x-msvideo' : 'audio/x-msvideo',
      extension: extension === 'avi' ? extension : 'avi',
      mediaInfo,
    },
  };
}

function readChunks(reader: BoundedMediaReader, range: ByteRange): RiffChunk[] {
  const chunks: RiffChunk[] = [];
  let offset = range.start;
  while (offset + 8 <= range.end && reader.countElement()) {
    const id = reader.ascii(offset, 4);
    const size = reader.uint32(offset + 4, true);
    if (!id || size === null || size < 0) break;
    const dataStart = offset + 8;
    const end = dataStart + size;
    if (end > range.end) break;
    chunks.push({
      id,
      start: offset,
      dataStart,
      end,
      listType: id === 'LIST' && size >= 4 ? reader.ascii(dataStart, 4) : null,
    });
    offset = end + (size & 1);
  }
  return chunks;
}

function parseMainHeader(
  reader: BoundedMediaReader,
  header: RiffChunk | undefined,
): {
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly frameRate: number | null;
} {
  if (!header || header.end - header.dataStart < 40) {
    return { durationSeconds: null, width: null, height: null, frameRate: null };
  }
  const microsecondsPerFrame = reader.uint32(header.dataStart, true);
  const totalFrames = reader.uint32(header.dataStart + 16, true);
  const width = reader.uint32(header.dataStart + 32, true);
  const height = reader.uint32(header.dataStart + 36, true);
  return {
    durationSeconds:
      microsecondsPerFrame !== null && totalFrames !== null ? boundedDuration((microsecondsPerFrame * totalFrames) / 1_000_000) : null,
    width,
    height,
    frameRate: microsecondsPerFrame ? 1_000_000 / microsecondsPerFrame : null,
  };
}

function parseStream(reader: BoundedMediaReader, streamList: RiffChunk): AviStream | null {
  const chunks = readChunks(reader, { start: streamList.dataStart + 4, end: streamList.end });
  const header = chunks.find((chunk) => chunk.id === 'strh');
  const format = chunks.find((chunk) => chunk.id === 'strf');
  if (!header || header.end - header.dataStart < 36) return null;
  const type = reader.ascii(header.dataStart, 4);
  const streamType = type === 'vids' ? 'video' : type === 'auds' ? 'audio' : null;
  if (!streamType) return null;
  const handler = reader.ascii(header.dataStart + 4, 4);
  const scale = reader.uint32(header.dataStart + 20, true);
  const rate = reader.uint32(header.dataStart + 24, true);
  const length = reader.uint32(header.dataStart + 32, true);
  const frameRate = safeRatio(rate, scale);
  const durationSeconds = rate && scale !== null && length !== null ? (length * scale) / rate : null;
  const facts = streamType === 'video' ? parseVideoFormat(reader, format, handler) : parseAudioFormat(reader, format);
  return {
    stream: {
      type: streamType,
      codec: facts.codec,
      profile: null,
      level: null,
      bitDepth: facts.bitDepth,
      channels: facts.channels,
      sampleRate: facts.sampleRate,
      language: null,
    },
    durationSeconds: boundedDuration(durationSeconds),
    width: facts.width,
    height: facts.height,
    frameRate: boundedFrameRate(frameRate),
    complete: facts.codec !== null,
  };
}

function parseVideoFormat(
  reader: BoundedMediaReader,
  format: RiffChunk | undefined,
  handler: string | null,
): {
  readonly codec: string | null;
  readonly bitDepth: number | null;
  readonly channels: null;
  readonly sampleRate: null;
  readonly width: number | null;
  readonly height: number | null;
} {
  const validFormat = format && format.end - format.dataStart >= 20 ? format : null;
  const width = validFormat ? reader.int32(validFormat.dataStart + 4, true) : null;
  const height = validFormat ? reader.int32(validFormat.dataStart + 8, true) : null;
  const compression = validFormat ? reader.ascii(validFormat.dataStart + 16, 4) : null;
  return {
    codec: aviVideoCodec(compression?.replace(/\0/gu, '') || handler?.replace(/\0/gu, '') || null),
    bitDepth: null,
    channels: null,
    sampleRate: null,
    width: width === null ? null : Math.abs(width),
    height: height === null ? null : Math.abs(height),
  };
}

function parseAudioFormat(
  reader: BoundedMediaReader,
  format: RiffChunk | undefined,
): {
  readonly codec: string | null;
  readonly bitDepth: number | null;
  readonly channels: number | null;
  readonly sampleRate: number | null;
  readonly width: null;
  readonly height: null;
} {
  const validFormat = format && format.end - format.dataStart >= 16 ? format : null;
  const tag = validFormat ? reader.uint16(validFormat.dataStart, true) : null;
  return {
    codec: aviAudioCodec(tag),
    bitDepth: boundedBitDepth(validFormat ? reader.uint16(validFormat.dataStart + 14, true) : null),
    channels: boundedChannels(validFormat ? reader.uint16(validFormat.dataStart + 2, true) : null),
    sampleRate: boundedSampleRate(validFormat ? reader.uint32(validFormat.dataStart + 4, true) : null),
    width: null,
    height: null,
  };
}

function aviVideoCodec(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (['H264', 'X264', 'AVC1'].includes(normalized)) return 'H.264';
  if (['HEVC', 'H265'].includes(normalized)) return 'HEVC';
  if (['DIVX', 'DX50', 'FMP4', 'XVID', 'MP4V'].includes(normalized)) return 'MPEG-4 Part 2';
  if (['MJPG', 'JPEG'].includes(normalized)) return 'Motion JPEG';
  if (normalized === 'VP80') return 'VP8';
  if (normalized === 'VP90') return 'VP9';
  if (normalized === 'AV01') return 'AV1';
  return normalized || null;
}

function aviAudioCodec(tag: number | null): string | null {
  return (
    (
      {
        0x0001: 'PCM',
        0x0050: 'MP2',
        0x0055: 'MP3',
        0x00ff: 'AAC',
        0x2000: 'AC-3',
        0x2001: 'DTS',
      } as Record<number, string>
    )[tag ?? -1] ?? (tag === null ? null : `WAVE 0x${tag.toString(16).padStart(4, '0')}`)
  );
}

function invalid(message: string, probeLimit = false): CommonMediaProbeResult {
  return { status: 'invalid', reason: probeLimit ? 'probe-limit' : 'malformed', message };
}
