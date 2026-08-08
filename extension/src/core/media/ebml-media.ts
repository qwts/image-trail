import { BoundedMediaReader, normalizedFileExtension, normalizedLanguage } from './binary-media-probe.js';
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

interface EbmlElement {
  readonly id: number;
  readonly dataStart: number;
  readonly end: number;
}

interface EbmlTrack {
  readonly stream: CommonMediaStreamInfo;
  readonly width: number | null;
  readonly height: number | null;
  readonly displayWidth: number | null;
  readonly displayHeight: number | null;
  readonly frameRate: number | null;
  readonly colorTransfer: string | null;
  readonly hdr: boolean | null;
  readonly complete: boolean;
}

const EBML_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const TRACKS_ID = 0x1654ae6b;
const TRACK_ENTRY_ID = 0xae;

export function inspectEbmlMedia(bytes: Uint8Array, _declaredMimeType = '', fileNameOrUrl = ''): CommonMediaProbeResult {
  const reader = new BoundedMediaReader(bytes);
  if (reader.uint32(0) !== EBML_ID) return { status: 'not-common-media' };
  const top = readElements(reader, 0, bytes.byteLength);
  const header = top.find((element) => element.id === EBML_ID);
  const segment = top.find((element) => element.id === SEGMENT_ID);
  if (reader.probeLimitExceeded) return invalid('EBML metadata exceeds the bounded element limit.', true);
  if (!header || !segment) return invalid('EBML media header or segment metadata is malformed.');
  const headerChildren = childElements(reader, header);
  const docType = elementString(reader, headerChildren.find((element) => element.id === 0x4282) ?? null)?.toLowerCase();
  if (docType !== 'webm' && docType !== 'matroska') return invalid('EBML DocType is not WebM or Matroska media.');
  const segmentChildren = readElements(reader, segment.dataStart, segment.end);
  const info = segmentChildren.find((element) => element.id === INFO_ID);
  const tracksElement = segmentChildren.find((element) => element.id === TRACKS_ID);
  if (!tracksElement) return invalid('EBML media does not contain a bounded track table.');
  const trackElements = childElements(reader, tracksElement);
  const tracks = trackElements
    .filter((element) => element.id === TRACK_ENTRY_ID)
    .slice(0, MAX_COMMON_MEDIA_STREAMS)
    .map((entry) => parseTrack(reader, entry))
    .filter((track): track is EbmlTrack => track !== null);
  if (reader.probeLimitExceeded) return invalid('EBML metadata exceeds the bounded element limit.', true);
  if (!tracks.some((track) => track.stream.type === 'video' || track.stream.type === 'audio')) {
    return invalid('EBML media does not contain a valid audio or video track.');
  }
  const video = tracks.find((track) => track.stream.type === 'video') ?? null;
  const mediaKind = video ? 'video' : 'audio';
  const timecodeScale = elementUnsigned(reader, info ? findChild(reader, info, 0x2ad7b1) : null) ?? 1_000_000;
  const durationUnits = elementFloat(reader, info ? findChild(reader, info, 0x4489) : null);
  if (reader.probeLimitExceeded) return invalid('EBML metadata exceeds the bounded element limit.', true);
  const durationSeconds = boundedDuration(durationUnits === null ? null : (durationUnits * timecodeScale) / 1_000_000_000);
  const codedDimensions = commonMediaDimensions(video?.width ?? null, video?.height ?? null, null);
  const displayDimensions = commonMediaDimensions(video?.displayWidth ?? null, video?.displayHeight ?? null, null);
  const dimensions = {
    ...codedDimensions,
    displayWidth: displayDimensions.displayWidth ?? codedDimensions.displayWidth,
    displayHeight: displayDimensions.displayHeight ?? codedDimensions.displayHeight,
  };
  const container = docType === 'webm' ? 'WebM' : 'Matroska';
  const mediaInfo: CommonMediaInfo = {
    kind: 'common-media',
    mediaKind,
    animated: false,
    frameCount: null,
    loopCount: null,
    container,
    streams: tracks.map((track) => track.stream),
    durationSeconds,
    ...dimensions,
    rotationDegrees: null,
    frameRate: boundedFrameRate(video?.frameRate ?? null),
    variableFrameRate: null,
    audioPresent: tracks.some((track) => track.stream.type === 'audio'),
    hdr: video?.hdr ?? null,
    colorTransfer: video?.colorTransfer ?? null,
    probeIncomplete: !info || tracks.some((track) => !track.complete),
  };
  return {
    status: 'supported',
    probe: {
      mimeType:
        container === 'WebM'
          ? mediaKind === 'audio'
            ? 'audio/webm'
            : 'video/webm'
          : mediaKind === 'audio'
            ? 'audio/x-matroska'
            : 'video/x-matroska',
      extension: ebmlExtension(fileNameOrUrl, container, mediaKind),
      mediaInfo,
    },
  };
}

function parseTrack(reader: BoundedMediaReader, entry: EbmlElement): EbmlTrack | null {
  const children = childElements(reader, entry);
  const type = elementUnsigned(reader, children.find((element) => element.id === 0x83) ?? null);
  const streamType = type === 1 ? 'video' : type === 2 ? 'audio' : type === 17 ? 'text' : null;
  if (!streamType) return null;
  const codecId = elementString(reader, children.find((element) => element.id === 0x86) ?? null, 80);
  const codec = codecName(codecId);
  const privateElement = children.find((element) => element.id === 0x63a2) ?? null;
  const codecFacts = codecPrivateFacts(reader, privateElement, codec);
  const language = normalizedLanguage(elementString(reader, children.find((element) => element.id === 0x22b59c) ?? null));
  const defaultDuration = elementUnsigned(reader, children.find((element) => element.id === 0x23e383) ?? null);
  const video = children.find((element) => element.id === 0xe0);
  const audio = children.find((element) => element.id === 0xe1);
  const videoChildren = video ? childElements(reader, video) : [];
  const audioChildren = audio ? childElements(reader, audio) : [];
  const codedDimensions = commonMediaDimensions(
    elementUnsigned(reader, videoChildren.find((element) => element.id === 0xb0) ?? null),
    elementUnsigned(reader, videoChildren.find((element) => element.id === 0xba) ?? null),
    null,
  );
  const displayDimensions = commonMediaDimensions(
    elementUnsigned(reader, videoChildren.find((element) => element.id === 0x54b0) ?? null),
    elementUnsigned(reader, videoChildren.find((element) => element.id === 0x54ba) ?? null),
    null,
  );
  const colour = videoChildren.find((element) => element.id === 0x55b0);
  const transferCode = colour ? elementUnsigned(reader, findChild(reader, colour, 0x55ba)) : null;
  const transfer = transferName(transferCode);
  const sampleRate = elementFloat(reader, audioChildren.find((element) => element.id === 0xb5) ?? null);
  const channels = elementUnsigned(reader, audioChildren.find((element) => element.id === 0x9f) ?? null);
  return {
    stream: {
      type: streamType,
      codec,
      profile: codecFacts.profile,
      level: codecFacts.level,
      bitDepth: boundedBitDepth(codecFacts.bitDepth),
      channels: boundedChannels(channels),
      sampleRate: boundedSampleRate(sampleRate === null ? null : Math.round(sampleRate)),
      language,
    },
    width: codedDimensions.codedWidth,
    height: codedDimensions.codedHeight,
    displayWidth: displayDimensions.displayWidth,
    displayHeight: displayDimensions.displayHeight,
    frameRate: defaultDuration ? 1_000_000_000 / defaultDuration : null,
    colorTransfer: transfer,
    hdr: transferCode === 16 || transferCode === 18 ? true : transferCode === null ? null : false,
    complete: codec !== null && (streamType !== 'video' || (codedDimensions.codedWidth !== null && codedDimensions.codedHeight !== null)),
  };
}

function readElements(reader: BoundedMediaReader, start: number, end: number): EbmlElement[] {
  const elements: EbmlElement[] = [];
  let offset = start;
  while (offset < end && reader.countElement()) {
    const id = readVint(reader, offset, false);
    if (!id) break;
    const size = readVint(reader, offset + id.length, true);
    if (!size) break;
    const dataStart = offset + id.length + size.length;
    const elementEnd = size.unknown ? end : dataStart + size.value;
    if (elementEnd < dataStart || elementEnd > end) break;
    elements.push({ id: id.value, dataStart, end: elementEnd });
    offset = elementEnd;
  }
  return elements;
}

function childElements(reader: BoundedMediaReader, parent: EbmlElement): EbmlElement[] {
  return readElements(reader, parent.dataStart, parent.end);
}

function findChild(reader: BoundedMediaReader, parent: EbmlElement, id: number): EbmlElement | null {
  return childElements(reader, parent).find((element) => element.id === id) ?? null;
}

function readVint(
  reader: BoundedMediaReader,
  offset: number,
  stripMarker: boolean,
): { readonly value: number; readonly length: number; readonly unknown: boolean } | null {
  const first = reader.bytes[offset];
  if (first === undefined || first === 0) return null;
  let marker = 0x80;
  let length = 1;
  while ((first & marker) === 0 && length < 8) {
    marker >>= 1;
    length += 1;
  }
  if (!reader.contains(offset, length) || (!stripMarker && length > 4)) return null;
  let value = stripMarker ? first & (marker - 1) : first;
  let unknown = stripMarker && value === marker - 1;
  for (let index = 1; index < length; index += 1) {
    const byte = reader.bytes[offset + index]!;
    value = value * 256 + byte;
    unknown = unknown && byte === 0xff;
  }
  return Number.isSafeInteger(value) ? { value, length, unknown } : null;
}

function elementUnsigned(reader: BoundedMediaReader, element: EbmlElement | null): number | null {
  if (!element) return null;
  const length = element.end - element.dataStart;
  if (length < 1 || length > 8) return null;
  let value = 0;
  for (let offset = element.dataStart; offset < element.end; offset += 1) value = value * 256 + reader.bytes[offset]!;
  return Number.isSafeInteger(value) ? value : null;
}

function elementFloat(reader: BoundedMediaReader, element: EbmlElement | null): number | null {
  if (!element) return null;
  const length = element.end - element.dataStart;
  const value = length === 4 ? reader.float32(element.dataStart) : length === 8 ? reader.float64(element.dataStart) : null;
  return value !== null && Number.isFinite(value) ? value : null;
}

function elementString(reader: BoundedMediaReader, element: EbmlElement | null, maximumLength = 256): string | null {
  if (!element || element.end - element.dataStart > maximumLength) return null;
  return (
    reader
      .ascii(element.dataStart, element.end - element.dataStart)
      ?.replace(/\0/gu, '')
      .trim() || null
  );
}

function codecName(codecId: string | null): string | null {
  if (!codecId) return null;
  return (
    (
      {
        V_VP8: 'VP8',
        V_VP9: 'VP9',
        V_AV1: 'AV1',
        'V_MPEG4/ISO/AVC': 'H.264',
        'V_MPEGH/ISO/HEVC': 'HEVC',
        V_PRORES: 'ProRes',
        V_MPEG2: 'MPEG-2 Video',
        A_OPUS: 'Opus',
        A_VORBIS: 'Vorbis',
        A_AAC: 'AAC',
        'A_MPEG/L2': 'MP2',
        'A_MPEG/L3': 'MP3',
        A_ALAC: 'ALAC',
        A_PCM: 'PCM',
      } as Record<string, string>
    )[codecId] ?? codecId
  );
}

function codecPrivateFacts(
  reader: BoundedMediaReader,
  element: EbmlElement | null,
  codec: string | null,
): { readonly profile: string | null; readonly level: string | null; readonly bitDepth: number | null } {
  if (!element) return { profile: null, level: null, bitDepth: null };
  if (!codecPrivateLengthValid(element, codec)) return { profile: null, level: null, bitDepth: null };
  if (codec === 'H.264') {
    const profile = reader.bytes[element.dataStart + 1];
    const level = reader.bytes[element.dataStart + 3];
    return {
      profile: profile === undefined ? null : h264Profile(profile),
      level: level === undefined ? null : `${Math.floor(level / 10)}.${level % 10}`,
      bitDepth: profile !== undefined && profile >= 110 ? 10 : 8,
    };
  }
  if (codec === 'HEVC') {
    const profile = (reader.bytes[element.dataStart + 1] ?? 0) & 0x1f;
    const level = reader.bytes[element.dataStart + 12];
    const bitDepthMinusEight = reader.bytes[element.dataStart + 17];
    return {
      profile: profile === 1 ? 'Main' : profile === 2 ? 'Main 10' : profile > 0 ? `Profile ${profile}` : null,
      level: level === undefined ? null : `${Math.floor(level / 30)}.${Math.floor((level % 30) / 3)}`,
      bitDepth: bitDepthMinusEight === undefined ? null : 8 + (bitDepthMinusEight & 0x07),
    };
  }
  return { profile: null, level: null, bitDepth: null };
}

function codecPrivateLengthValid(element: EbmlElement, codec: string | null): boolean {
  const length = element.end - element.dataStart;
  return codec === 'H.264' ? length >= 4 : codec === 'HEVC' ? length >= 18 : true;
}

function h264Profile(value: number): string {
  return (
    ({ 66: 'Baseline', 77: 'Main', 88: 'Extended', 100: 'High', 110: 'High 10', 122: 'High 4:2:2' } as Record<number, string>)[value] ??
    `Profile ${value}`
  );
}

function transferName(code: number | null): string | null {
  if (code === null) return null;
  return (
    ({ 1: 'BT.709', 6: 'SMPTE 170M', 13: 'sRGB', 16: 'PQ (ST 2084)', 18: 'HLG' } as Record<number, string>)[code] ?? `Transfer ${code}`
  );
}

function ebmlExtension(fileNameOrUrl: string, container: 'WebM' | 'Matroska', mediaKind: 'video' | 'audio'): string {
  const extension = normalizedFileExtension(fileNameOrUrl);
  if (container === 'Matroska')
    return extension === 'mka' && mediaKind === 'audio' ? 'mka' : extension === 'mkv' ? 'mkv' : mediaKind === 'audio' ? 'mka' : 'mkv';
  return extension === 'weba' && mediaKind === 'audio' ? 'weba' : extension === 'webm' ? 'webm' : mediaKind === 'audio' ? 'weba' : 'webm';
}

function invalid(message: string, probeLimit = false): CommonMediaProbeResult {
  return { status: 'invalid', reason: probeLimit ? 'probe-limit' : 'malformed', message };
}
