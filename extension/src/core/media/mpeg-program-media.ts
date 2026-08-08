import { BoundedMediaReader, normalizedFileExtension } from './binary-media-probe.js';
import {
  boundedDuration,
  boundedFrameRate,
  commonMediaDimensions,
  MAX_COMMON_MEDIA_PROBE_BYTES,
  type CommonMediaInfo,
  type CommonMediaProbeResult,
  type CommonMediaStreamInfo,
} from './common-media-types.js';
import { probeMpegAudio } from './mpeg-audio.js';

const PACK_START = [0x00, 0x00, 0x01, 0xba] as const;
const SEQUENCE_START = [0x00, 0x00, 0x01, 0xb3] as const;
const EXTENSION_START = [0x00, 0x00, 0x01, 0xb5] as const;
const FRAME_RATES = [null, 23.976, 24, 25, 29.97, 30, 50, 59.94, 60] as const;

export function inspectMpegProgramMedia(bytes: Uint8Array, _declaredMimeType = '', fileNameOrUrl = ''): CommonMediaProbeResult {
  const reader = new BoundedMediaReader(bytes);
  const packOffset = reader.find(PACK_START, 0, Math.min(bytes.byteLength, 512));
  if (packOffset < 0) {
    const audio = probeMpegAudio(bytes, true);
    if (!audio) return { status: 'not-common-media' };
    return {
      status: 'supported',
      probe: {
        mimeType: 'audio/mpeg',
        extension: normalizedFileExtension(fileNameOrUrl) === 'mp2' ? 'mp2' : 'mp2',
        mediaInfo: audioMediaInfo(audio.stream, audio.durationSeconds),
      },
    };
  }
  const scanEnd = Math.min(bytes.byteLength, packOffset + MAX_COMMON_MEDIA_PROBE_BYTES);
  const sequenceOffset = reader.find(SEQUENCE_START, packOffset, scanEnd);
  const video = sequenceOffset < 0 ? null : videoFacts(reader, sequenceOffset, scanEnd);
  const audio = probeMpegAudio(bytes.subarray(packOffset, scanEnd));
  if (!video && !audio) return invalid('MPEG program stream does not contain a bounded audio or video sequence.');
  for (let offset = packOffset; offset + 6 <= scanEnd; offset += 1) {
    if (reader.bytes[offset] !== 0 || reader.bytes[offset + 1] !== 0 || reader.bytes[offset + 2] !== 1) continue;
    const streamId = reader.bytes[offset + 3] ?? 0;
    if (!((streamId >= 0xc0 && streamId <= 0xef) || streamId === 0xbd)) continue;
    const pesLength = ((reader.bytes[offset + 4] ?? 0) << 8) | (reader.bytes[offset + 5] ?? 0);
    if (pesLength === 0) continue;
    if (offset + 6 + pesLength > bytes.byteLength) return invalid('MPEG program stream is truncated.');
  }
  const pts = collectPts(reader, packOffset, scanEnd);
  const durationSeconds = boundedDuration(
    pts.maximum !== null && pts.minimum !== null ? (pts.maximum - pts.minimum) / 90_000 : (audio?.durationSeconds ?? null),
  );
  const streams: CommonMediaStreamInfo[] = [];
  if (video) streams.push(video.stream);
  if (audio) streams.push(audio.stream);
  const dimensions = commonMediaDimensions(video?.width ?? null, video?.height ?? null, 0);
  const mediaInfo: CommonMediaInfo = {
    kind: 'common-media',
    mediaKind: video ? 'video' : 'audio',
    animated: false,
    frameCount: null,
    loopCount: null,
    container: 'MPEG-PS',
    streams,
    durationSeconds,
    ...dimensions,
    rotationDegrees: video ? 0 : null,
    frameRate: boundedFrameRate(video?.frameRate ?? null),
    variableFrameRate: video?.frameRate ? false : null,
    audioPresent: audio !== null,
    hdr: false,
    colorTransfer: video?.mpeg2 ? 'SMPTE 170M' : null,
    probeIncomplete: durationSeconds === null || (video !== null && (video.width === null || video.height === null)),
  };
  const extension = normalizedFileExtension(fileNameOrUrl);
  return {
    status: 'supported',
    probe: {
      mimeType: video ? 'video/mpeg' : 'audio/mpeg',
      extension: video ? (extension === 'mpg' || extension === 'mpeg' || extension === 'mpeg4' ? extension : 'mpg') : 'mp2',
      mediaInfo,
    },
  };
}

function videoFacts(
  reader: BoundedMediaReader,
  sequenceOffset: number,
  scanEnd: number,
): {
  readonly stream: CommonMediaStreamInfo;
  readonly width: number | null;
  readonly height: number | null;
  readonly frameRate: number | null;
  readonly mpeg2: boolean;
} | null {
  if (sequenceOffset + 8 > scanEnd || !reader.contains(sequenceOffset + 4, 4)) return null;
  const first = reader.bytes[sequenceOffset + 4]!;
  const second = reader.bytes[sequenceOffset + 5]!;
  const third = reader.bytes[sequenceOffset + 6]!;
  const fourth = reader.bytes[sequenceOffset + 7]!;
  const width = (first << 4) | (second >> 4);
  const height = ((second & 0x0f) << 8) | third;
  const frameRate = FRAME_RATES[fourth & 0x0f] ?? null;
  const extensionOffset = reader.find(EXTENSION_START, sequenceOffset + 8, Math.min(scanEnd, sequenceOffset + 2_048));
  const completeExtension = extensionOffset >= 0 && extensionOffset + 6 <= scanEnd;
  const extensionType = completeExtension ? (reader.bytes[extensionOffset + 4] ?? 0) >> 4 : null;
  const mpeg2 = extensionType === 1;
  return {
    stream: {
      type: 'video',
      codec: mpeg2 ? 'MPEG-2 Video' : 'MPEG-1 Video',
      profile:
        mpeg2 && completeExtension ? mpeg2Profile(reader.bytes[extensionOffset + 4] ?? 0, reader.bytes[extensionOffset + 5] ?? 0) : null,
      level: null,
      bitDepth: 8,
      channels: null,
      sampleRate: null,
      language: null,
    },
    width,
    height,
    frameRate,
    mpeg2,
  };
}

function collectPts(
  reader: BoundedMediaReader,
  start: number,
  end: number,
): { readonly minimum: number | null; readonly maximum: number | null } {
  let minimum: number | null = null;
  let maximum: number | null = null;
  for (let offset = start; offset + 14 <= end; offset += 1) {
    if (reader.bytes[offset] !== 0 || reader.bytes[offset + 1] !== 0 || reader.bytes[offset + 2] !== 1) continue;
    const streamId = reader.bytes[offset + 3] ?? 0;
    if (!((streamId >= 0xc0 && streamId <= 0xef) || streamId === 0xbd)) continue;
    const flags = reader.bytes[offset + 7] ?? 0;
    if ((flags & 0x80) === 0) continue;
    const pts = decodePts(reader, offset + 9);
    if (pts === null) continue;
    minimum = minimum === null ? pts : Math.min(minimum, pts);
    maximum = maximum === null ? pts : Math.max(maximum, pts);
  }
  return { minimum, maximum };
}

function decodePts(reader: BoundedMediaReader, offset: number): number | null {
  if (!reader.contains(offset, 5)) return null;
  const a = reader.bytes[offset]!;
  const b = reader.bytes[offset + 1]!;
  const c = reader.bytes[offset + 2]!;
  const d = reader.bytes[offset + 3]!;
  const e = reader.bytes[offset + 4]!;
  if ((a & 1) !== 1 || (c & 1) !== 1 || (e & 1) !== 1) return null;
  return ((a >> 1) & 0x07) * 2 ** 30 + b * 2 ** 22 + ((c >> 1) & 0x7f) * 2 ** 15 + d * 2 ** 7 + ((e >> 1) & 0x7f);
}

function mpeg2Profile(first: number, second: number): string | null {
  const profile = ((first & 0x0f) << 1) | (second >> 7);
  return ({ 5: 'Simple', 4: 'Main', 3: 'SNR Scalable', 2: 'Spatially Scalable', 1: 'High' } as Record<number, string>)[profile] ?? null;
}

function audioMediaInfo(stream: CommonMediaStreamInfo, durationSeconds: number | null): CommonMediaInfo {
  return {
    kind: 'common-media',
    mediaKind: 'audio',
    animated: false,
    frameCount: null,
    loopCount: null,
    container: 'MPEG-Audio',
    streams: [stream],
    durationSeconds: boundedDuration(durationSeconds),
    ...commonMediaDimensions(null, null, null),
    rotationDegrees: null,
    frameRate: null,
    variableFrameRate: null,
    audioPresent: true,
    hdr: null,
    colorTransfer: null,
    probeIncomplete: durationSeconds === null,
  };
}

function invalid(message: string): CommonMediaProbeResult {
  return { status: 'invalid', reason: 'malformed', message };
}
