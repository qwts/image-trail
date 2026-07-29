import { hasValidMpeg2Crc } from './mpeg-ts-crc.js';
import { probeAacProfile, probeTransportStreamVideoMetadata } from './mpeg-ts-elementary-metadata.js';
import { hasMpegTsHint, mpegTsExtensionHint } from './mpeg-ts-hints.js';
import { isRemuxableMpegTsInfo } from './mpeg-ts-playback-tier.js';

export const MPEG_TS_MIME_TYPE = 'video/mp2t';
export const MAX_MPEG_TS_STREAMS = 32;
export const MAX_MPEG_TS_DURATION_SECONDS = 7 * 24 * 60 * 60;

export type MpegTsStreamKind = 'video' | 'audio' | 'unknown';

export interface MpegTsStreamInfo {
  readonly type: MpegTsStreamKind;
  readonly codec: string | null;
  readonly profile: string | null;
}

export interface MpegTsMediaInfo {
  readonly kind: 'mpeg-ts';
  readonly animated: false;
  readonly frameCount: null;
  readonly loopCount: null;
  readonly container: 'MPEG-TS';
  readonly streams: readonly MpegTsStreamInfo[];
  readonly durationSeconds: number | null;
  readonly codedWidth: number | null;
  readonly codedHeight: number | null;
  readonly displayWidth: number | null;
  readonly displayHeight: number | null;
  readonly rotationDegrees: 0 | 90 | 180 | 270 | null;
  readonly frameRate: number | null;
  readonly variableFrameRate: boolean;
  readonly audioPresent: boolean;
  readonly hdr: boolean | null;
  readonly colorTransfer: string | null;
  readonly probeIncomplete: boolean;
}

export interface MpegTsInspection {
  readonly status: 'playable' | 'preserved-only';
  readonly mimeType: typeof MPEG_TS_MIME_TYPE;
  readonly extension: 'ts' | 'mts' | 'm2ts';
  readonly mediaInfo: MpegTsMediaInfo;
}

export type MpegTsInspectionResult =
  | MpegTsInspection
  | { readonly status: 'not-mpeg-ts' }
  | {
      readonly status: 'invalid';
      readonly reason: 'malformed' | 'probe-limit';
      readonly message: string;
    };

export interface TsLayout {
  readonly packetSize: 188 | 192;
  readonly syncOffset: 0 | 4;
}

const SYNC_BYTE = 0x47;
const TRANSPORT_PACKET_BYTES = 188;
const PID_PAT = 0x0000;
const NULL_PID = 0x1fff;
const MIN_SYNC_PACKETS = 4;
const MAX_HEAD_PACKETS = 2_400;
const MAX_TAIL_PACKETS = 2_400;
const MAX_PSI_SECTION = 1_021;

const STREAM_TYPES: Readonly<Record<number, { readonly kind: MpegTsStreamKind; readonly codec: string }>> = {
  0x01: { kind: 'video', codec: 'MPEG-1 Video' },
  0x02: { kind: 'video', codec: 'MPEG-2 Video' },
  0x03: { kind: 'audio', codec: 'MP2' },
  0x04: { kind: 'audio', codec: 'MP2' },
  0x0f: { kind: 'audio', codec: 'AAC' },
  0x10: { kind: 'video', codec: 'MPEG-4 Part 2' },
  0x11: { kind: 'audio', codec: 'AAC' },
  0x1b: { kind: 'video', codec: 'H.264' },
  0x24: { kind: 'video', codec: 'H.265' },
  0x81: { kind: 'audio', codec: 'AC-3' },
  0x87: { kind: 'audio', codec: 'E-AC-3' },
};

interface PmtProbe {
  readonly streams: readonly PmtStreamProbe[];
  readonly pcrPid: number | null;
  readonly streamLimitReached: boolean;
}

interface PmtStreamProbe extends MpegTsStreamInfo {
  readonly pid: number;
}

export function inspectMpegTsMedia(
  bytesInput: ArrayBuffer | Uint8Array,
  declaredMimeType = '',
  fileNameOrUrl = '',
): MpegTsInspectionResult {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput);
  const layout = detectTsLayout(bytes);
  if (layout === null) {
    return hasMpegTsHint(declaredMimeType, fileNameOrUrl)
      ? {
          status: 'invalid',
          reason: 'malformed',
          message: 'MPEG-TS data does not contain a sustained 188-byte or 192-byte transport-packet cadence.',
        }
      : { status: 'not-mpeg-ts' };
  }

  const mediaInfo = probeTransportStream(bytes, layout);
  if (mediaInfo.probeIncomplete) {
    return {
      status: 'invalid',
      reason: 'malformed',
      message: 'MPEG-TS program metadata is truncated, malformed, or outside the bounded probe window.',
    };
  }
  if (mediaInfo.streams.length === 0) {
    return {
      status: 'invalid',
      reason: 'malformed',
      message: 'MPEG-TS program metadata does not declare any elementary streams.',
    };
  }
  return {
    status: isRemuxableTransportStream(mediaInfo) ? 'playable' : 'preserved-only',
    mimeType: MPEG_TS_MIME_TYPE,
    extension: mpegTsExtensionHint(fileNameOrUrl) ?? (layout.packetSize === 192 ? 'm2ts' : 'ts'),
    mediaInfo,
  };
}

export function detectTsLayout(bytes: Uint8Array): TsLayout | null {
  const candidates: readonly TsLayout[] = [
    { packetSize: 188, syncOffset: 0 },
    { packetSize: 192, syncOffset: 4 },
  ];
  for (const layout of candidates) {
    if (bytes[layout.syncOffset] !== SYNC_BYTE) continue;
    let confirmed = 0;
    let ran = 0;
    for (let index = 0; index < MIN_SYNC_PACKETS; index += 1) {
      const offset = layout.syncOffset + index * layout.packetSize;
      if (offset >= bytes.length) break;
      ran += 1;
      if (bytes[offset] !== SYNC_BYTE) {
        confirmed = -1;
        break;
      }
      confirmed += 1;
    }
    if (confirmed === MIN_SYNC_PACKETS) return layout;
    if (confirmed === ran && ran >= 1 && bytes.length >= layout.syncOffset + TRANSPORT_PACKET_BYTES) return layout;
  }
  return null;
}

export function probeTransportStream(bytes: Uint8Array, knownLayout: TsLayout | null = detectTsLayout(bytes)): MpegTsMediaInfo {
  const base = baseMediaInfo();
  if (knownLayout === null) return base;

  const headEnd = Math.min(bytes.length, knownLayout.syncOffset + MAX_HEAD_PACKETS * knownLayout.packetSize);
  const pat = readSection(bytes, knownLayout, PID_PAT, headEnd);
  if (pat === null || !hasValidMpeg2Crc(pat)) return base;
  const pmtPid = firstProgramMapPid(pat);
  if (pmtPid === null) return base;
  const pmtSection = readSection(bytes, knownLayout, pmtPid, headEnd);
  if (pmtSection === null || !hasValidMpeg2Crc(pmtSection)) return base;
  const pmt = parsePmt(pmtSection);
  if (pmt === null || pmt.streamLimitReached) return base;
  const durationSeconds = pmt.pcrPid === null ? null : estimateDuration(bytes, knownLayout, pmt.pcrPid, headEnd);
  if (durationSeconds !== null && durationSeconds > MAX_MPEG_TS_DURATION_SECONDS) return base;
  const videoStream = pmt.streams.find((stream) => stream.type === 'video' && stream.codec !== null);
  const videoMetadata =
    videoStream === undefined || videoStream.codec === null
      ? null
      : probeTransportStreamVideoMetadata(bytes, knownLayout, videoStream.pid, videoStream.codec, headEnd);
  const streams = pmt.streams.map((stream) => {
    const { pid, ...publicStream } = stream;
    return {
      ...publicStream,
      profile:
        stream === videoStream
          ? (videoMetadata?.profile ?? null)
          : stream.codec === 'AAC'
            ? probeAacProfile(bytes, knownLayout, pid, headEnd)
            : null,
    };
  });

  return {
    ...base,
    streams,
    durationSeconds,
    codedWidth: videoMetadata?.codedWidth ?? null,
    codedHeight: videoMetadata?.codedHeight ?? null,
    displayWidth: videoMetadata?.displayWidth ?? null,
    displayHeight: videoMetadata?.displayHeight ?? null,
    frameRate: videoMetadata?.frameRate ?? null,
    variableFrameRate: videoMetadata?.variableFrameRate ?? false,
    audioPresent: streams.some((stream) => stream.type === 'audio'),
    hdr: videoMetadata?.hdr ?? null,
    colorTransfer: videoMetadata?.colorTransfer ?? null,
    probeIncomplete: false,
  };
}

export function isRemuxableTransportStream(info: MpegTsMediaInfo): boolean {
  return isRemuxableMpegTsInfo(info);
}

function baseMediaInfo(): MpegTsMediaInfo {
  return {
    kind: 'mpeg-ts',
    animated: false,
    frameCount: null,
    loopCount: null,
    container: 'MPEG-TS',
    streams: [],
    durationSeconds: null,
    codedWidth: null,
    codedHeight: null,
    displayWidth: null,
    displayHeight: null,
    rotationDegrees: null,
    frameRate: null,
    variableFrameRate: false,
    audioPresent: false,
    hdr: null,
    colorTransfer: null,
    probeIncomplete: true,
  };
}

function pidAt(bytes: Uint8Array, packetStart: number): number {
  return (((bytes[packetStart + 1] ?? 0) & 0x1f) << 8) | (bytes[packetStart + 2] ?? 0);
}

function payloadStart(bytes: Uint8Array, packetStart: number, packetEnd: number): number | null {
  const flags = bytes[packetStart + 3];
  if (flags === undefined) return null;
  const adaptation = (flags & 0x30) >> 4;
  if (adaptation === 0x00 || adaptation === 0x02) return null;
  let cursor = packetStart + 4;
  if (adaptation === 0x03) {
    const length = bytes[cursor];
    if (length === undefined) return null;
    cursor += 1 + length;
  }
  return cursor < packetEnd ? cursor : null;
}

function readPcr(bytes: Uint8Array, packetStart: number): number | null {
  const flags = bytes[packetStart + 3];
  if (flags === undefined || (flags & 0x30) >> 4 < 0x02) return null;
  const adaptationLength = bytes[packetStart + 4];
  if (adaptationLength === undefined || adaptationLength < 7) return null;
  const adaptationFlags = bytes[packetStart + 5];
  if (adaptationFlags === undefined || (adaptationFlags & 0x10) === 0) return null;
  const offset = packetStart + 6;
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) return null;
  const b4 = bytes[offset + 4] ?? 0;
  return b0 * 2 ** 25 + b1 * 2 ** 17 + b2 * 2 ** 9 + b3 * 2 + ((b4 & 0x80) >> 7);
}

function readSection(bytes: Uint8Array, layout: TsLayout, pid: number, headEnd: number): Uint8Array | null {
  for (let start = layout.syncOffset; start + TRANSPORT_PACKET_BYTES <= headEnd; start += layout.packetSize) {
    if (bytes[start] !== SYNC_BYTE) return null;
    if (pidAt(bytes, start) !== pid || ((bytes[start + 1] ?? 0) & 0x40) === 0) continue;
    const payload = payloadStart(bytes, start, start + TRANSPORT_PACKET_BYTES);
    if (payload === null) continue;
    const pointer = bytes[payload];
    if (pointer === undefined) return null;
    const sectionStart = payload + 1 + pointer;
    const packetEnd = start + TRANSPORT_PACKET_BYTES;
    if (sectionStart + 3 > packetEnd) return null;
    const sectionLength = (((bytes[sectionStart + 1] ?? 0) & 0x0f) << 8) | (bytes[sectionStart + 2] ?? 0);
    if (sectionLength > MAX_PSI_SECTION) return null;
    const total = 3 + sectionLength;
    const chunks: Uint8Array[] = [bytes.subarray(sectionStart, packetEnd)];
    let collected = packetEnd - sectionStart;
    for (
      let continuation = packetEnd;
      collected < total && continuation + TRANSPORT_PACKET_BYTES <= headEnd;
      continuation += layout.packetSize
    ) {
      if (bytes[continuation] !== SYNC_BYTE) return null;
      if (pidAt(bytes, continuation) !== pid) continue;
      if (((bytes[continuation + 1] ?? 0) & 0x40) !== 0) break;
      const continuationPacketEnd = continuation + TRANSPORT_PACKET_BYTES;
      const continuationPayload = payloadStart(bytes, continuation, continuationPacketEnd);
      if (continuationPayload === null) continue;
      const chunk = bytes.subarray(continuationPayload, continuationPacketEnd);
      chunks.push(chunk);
      collected += chunk.length;
    }
    if (collected < total) return null;
    return concatChunks(chunks, total);
  }
  return null;
}

function concatChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= total) break;
    const slice = chunk.subarray(0, total - offset);
    output.set(slice, offset);
    offset += slice.length;
  }
  return output;
}

function firstProgramMapPid(section: Uint8Array): number | null {
  if (section[0] !== 0x00 || section[2] === undefined) return null;
  const length = (((section[1] ?? 0) & 0x0f) << 8) | section[2];
  const end = Math.min(3 + length - 4, section.length);
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    const programNumber = ((section[offset] ?? 0) << 8) | (section[offset + 1] ?? 0);
    const mapPid = (((section[offset + 2] ?? 0) & 0x1f) << 8) | (section[offset + 3] ?? 0);
    if (programNumber !== 0) return mapPid;
  }
  return null;
}

function parsePmt(section: Uint8Array): PmtProbe | null {
  if (section[0] !== 0x02) return null;
  const length = (((section[1] ?? 0) & 0x0f) << 8) | (section[2] ?? 0);
  const end = Math.min(3 + length - 4, section.length);
  const pcrPid = (((section[8] ?? 0) & 0x1f) << 8) | (section[9] ?? 0);
  const programInfoLength = (((section[10] ?? 0) & 0x0f) << 8) | (section[11] ?? 0);
  let cursor = 12 + programInfoLength;
  const streams: PmtStreamProbe[] = [];
  while (cursor + 5 <= end && streams.length < MAX_MPEG_TS_STREAMS) {
    const streamType = section[cursor] ?? 0;
    const pid = (((section[cursor + 1] ?? 0) & 0x1f) << 8) | (section[cursor + 2] ?? 0);
    const esInfoLength = (((section[cursor + 3] ?? 0) & 0x0f) << 8) | (section[cursor + 4] ?? 0);
    const mapped = STREAM_TYPES[streamType];
    streams.push({
      type: mapped?.kind ?? 'unknown',
      codec: mapped?.codec ?? null,
      profile: null,
      pid,
    });
    cursor += 5 + esInfoLength;
  }
  return {
    streams,
    pcrPid: pcrPid === NULL_PID ? null : pcrPid,
    streamLimitReached: cursor + 5 <= end,
  };
}

function estimateDuration(bytes: Uint8Array, layout: TsLayout, pcrPid: number, headEnd: number): number | null {
  let first: number | null = null;
  for (let start = layout.syncOffset; start + TRANSPORT_PACKET_BYTES <= headEnd; start += layout.packetSize) {
    if (bytes[start] !== SYNC_BYTE) break;
    if (pidAt(bytes, start) !== pcrPid) continue;
    const pcr = readPcr(bytes, start);
    if (pcr !== null) {
      first = pcr;
      break;
    }
  }
  if (first === null) return null;
  const packetCount = completePacketCount(bytes.length, layout);
  const tailPackets = Math.min(MAX_TAIL_PACKETS, packetCount);
  const tailStart = layout.syncOffset + Math.max(0, packetCount - tailPackets) * layout.packetSize;
  let last: number | null = null;
  for (let start = tailStart; start + TRANSPORT_PACKET_BYTES <= bytes.length; start += layout.packetSize) {
    if (bytes[start] !== SYNC_BYTE || pidAt(bytes, start) !== pcrPid) continue;
    const pcr = readPcr(bytes, start);
    if (pcr !== null) last = pcr;
  }
  if (last === null || last <= first) return null;
  const seconds = (last - first) / 90_000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function completePacketCount(byteLength: number, layout: TsLayout): number {
  const available = byteLength - layout.syncOffset;
  return available < TRANSPORT_PACKET_BYTES ? 0 : Math.floor((available - TRANSPORT_PACKET_BYTES) / layout.packetSize) + 1;
}
