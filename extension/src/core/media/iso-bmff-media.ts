import { BoundedMediaReader, normalizedLanguage, safeRatio } from './binary-media-probe.js';
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
import {
  childIsoBoxes as childBoxes,
  isoBoxContains as boxContains,
  isoBrands,
  readIsoBoxes as readBoxes,
  type IsoBox,
} from './iso-bmff-boxes.js';
import {
  codecFromIsoSampleEntry,
  h264ProfileName,
  isoMediaExtension,
  isoRotationFromMatrix,
  proResProfileName,
  transferName,
} from './iso-bmff-values.js';

interface IsoTrack {
  readonly stream: CommonMediaStreamInfo;
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly rotation: CommonMediaInfo['rotationDegrees'];
  readonly frameRate: number | null;
  readonly variableFrameRate: boolean | null;
  readonly colorTransfer: string | null;
  readonly hdr: boolean | null;
  readonly complete: boolean;
}

const VIDEO_HANDLERS = new Set(['vide']);
const AUDIO_HANDLERS = new Set(['soun']);
const MAX_ISO_BRANDS = 64;
const MAX_ISO_TIME_TO_SAMPLE_ENTRIES = 4_096;

export function inspectIsoBmffMedia(bytes: Uint8Array, _declaredMimeType = '', fileNameOrUrl = ''): CommonMediaProbeResult {
  const reader = new BoundedMediaReader(bytes);
  const topLevel = readBoxes(reader, { start: 0, end: bytes.byteLength });
  const ftyp = topLevel.find((box) => box.type === 'ftyp');
  if (!ftyp) return { status: 'not-common-media' };
  if (reader.probeLimitExceeded) return invalid('ISO BMFF metadata exceeds the bounded element limit.', true);
  if (ftyp.end - ftyp.payloadStart > 8 + MAX_ISO_BRANDS * 4) {
    return invalid('ISO BMFF file-type metadata exceeds the bounded brand limit.', true);
  }
  const brands = isoBrands(reader, ftyp);
  if (brands.length === 0) return invalid('ISO BMFF file-type metadata is malformed.');
  const quickTime = brands.includes('qt  ');
  const moov = topLevel.find((box) => box.type === 'moov');
  if (!moov) {
    return invalid('ISO BMFF movie metadata is missing or outside the bounded container structure.');
  }
  const movieChildren = childBoxes(reader, moov);
  const trackBoxes = movieChildren.filter((box) => box.type === 'trak');
  const trackLimitExceeded = trackBoxes.length > MAX_COMMON_MEDIA_STREAMS;
  const tracks = trackBoxes
    .slice(0, MAX_COMMON_MEDIA_STREAMS)
    .map((track) => parseTrack(reader, track))
    .filter((track): track is IsoTrack => track !== null);
  if (reader.probeLimitExceeded) return invalid('ISO BMFF metadata exceeds the bounded element limit.', true);
  if (tracks.length === 0) return invalid('ISO BMFF metadata does not contain a valid audio or video track.');

  const video = tracks.find((track) => track.stream.type === 'video') ?? null;
  const mediaKind = video ? 'video' : 'audio';
  const mvhdDuration = movieDuration(
    reader,
    movieChildren.find((box) => box.type === 'mvhd'),
  );
  const durationSeconds = boundedDuration(
    mvhdDuration ?? tracks.reduce<number | null>((maximum, track) => Math.max(maximum ?? 0, track.durationSeconds ?? 0), null),
  );
  const dimensions = commonMediaDimensions(video?.width ?? null, video?.height ?? null, video?.rotation ?? null);
  const container = quickTime ? 'QuickTime' : 'ISO-BMFF';
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
    rotationDegrees: video?.rotation ?? null,
    frameRate: boundedFrameRate(video?.frameRate ?? null),
    variableFrameRate: video?.variableFrameRate ?? null,
    audioPresent: tracks.some((track) => track.stream.type === 'audio'),
    hdr: video?.hdr ?? null,
    colorTransfer: video?.colorTransfer ?? null,
    probeIncomplete: trackLimitExceeded || tracks.some((track) => !track.complete),
  };
  return {
    status: 'supported',
    probe: {
      mimeType: quickTime ? 'video/quicktime' : mediaKind === 'audio' ? 'audio/mp4' : 'video/mp4',
      extension: isoMediaExtension(fileNameOrUrl, quickTime, mediaKind),
      mediaInfo,
    },
  };
}

function parseTrack(reader: BoundedMediaReader, track: IsoBox): IsoTrack | null {
  const children = childBoxes(reader, track);
  const tkhd = children.find((box) => box.type === 'tkhd');
  const mdia = children.find((box) => box.type === 'mdia');
  if (!mdia) return null;
  const mediaChildren = childBoxes(reader, mdia);
  const handler = handlerType(
    reader,
    mediaChildren.find((box) => box.type === 'hdlr'),
  );
  const streamType = VIDEO_HANDLERS.has(handler ?? '') ? 'video' : AUDIO_HANDLERS.has(handler ?? '') ? 'audio' : null;
  if (!streamType) return null;
  const mdhd = parseMediaHeader(
    reader,
    mediaChildren.find((box) => box.type === 'mdhd'),
  );
  const minf = mediaChildren.find((box) => box.type === 'minf');
  const stbl = minf ? childBoxes(reader, minf).find((box) => box.type === 'stbl') : undefined;
  const sampleTable = stbl ? childBoxes(reader, stbl) : [];
  const sample = parseSampleDescription(
    reader,
    sampleTable.find((box) => box.type === 'stsd'),
    streamType,
  );
  if (!sample) return null;
  const timing = parseSampleTiming(
    reader,
    sampleTable.find((box) => box.type === 'stts'),
    mdhd.timescale,
  );
  const trackGeometry = parseTrackGeometry(reader, tkhd);
  const width = sample.width ?? trackGeometry.width;
  const height = sample.height ?? trackGeometry.height;
  return {
    stream: { ...sample.stream, language: mdhd.language },
    durationSeconds: boundedDuration(safeRatio(mdhd.duration, mdhd.timescale)),
    width,
    height,
    rotation: trackGeometry.rotation,
    frameRate: timing.frameRate,
    variableFrameRate: timing.variableFrameRate,
    colorTransfer: sample.colorTransfer,
    hdr: sample.hdr,
    complete: mdhd.complete && sample.complete && timing.complete,
  };
}

function movieDuration(reader: BoundedMediaReader, mvhd: IsoBox | undefined): number | null {
  if (!mvhd) return null;
  const version = reader.bytes[mvhd.payloadStart];
  const timescaleOffset = mvhd.payloadStart + (version === 1 ? 20 : 12);
  const durationOffset = mvhd.payloadStart + (version === 1 ? 24 : 16);
  const durationLength = version === 1 ? 8 : 4;
  if (!boxContains(mvhd, timescaleOffset, 4) || !boxContains(mvhd, durationOffset, durationLength)) return null;
  const timescale = reader.uint32(timescaleOffset);
  const duration = version === 1 ? reader.uint64(durationOffset) : reader.uint32(durationOffset);
  return boundedDuration(safeRatio(duration, timescale));
}

function handlerType(reader: BoundedMediaReader, hdlr: IsoBox | undefined): string | null {
  return hdlr && boxContains(hdlr, hdlr.payloadStart + 8, 4) ? reader.ascii(hdlr.payloadStart + 8, 4) : null;
}

function parseMediaHeader(
  reader: BoundedMediaReader,
  mdhd: IsoBox | undefined,
): { readonly timescale: number | null; readonly duration: number | null; readonly language: string | null; readonly complete: boolean } {
  if (!mdhd) return { timescale: null, duration: null, language: null, complete: false };
  const version = reader.bytes[mdhd.payloadStart];
  const timescaleOffset = mdhd.payloadStart + (version === 1 ? 20 : 12);
  const durationOffset = mdhd.payloadStart + (version === 1 ? 24 : 16);
  const languageOffset = mdhd.payloadStart + (version === 1 ? 32 : 20);
  const durationLength = version === 1 ? 8 : 4;
  if (
    !boxContains(mdhd, timescaleOffset, 4) ||
    !boxContains(mdhd, durationOffset, durationLength) ||
    !boxContains(mdhd, languageOffset, 2)
  ) {
    return { timescale: null, duration: null, language: null, complete: false };
  }
  const packedLanguage = reader.uint16(languageOffset);
  const language =
    packedLanguage === null
      ? null
      : normalizedLanguage(
          String.fromCharCode(
            ((packedLanguage >> 10) & 0x1f) + 0x60,
            ((packedLanguage >> 5) & 0x1f) + 0x60,
            (packedLanguage & 0x1f) + 0x60,
          ),
        );
  const timescale = reader.uint32(timescaleOffset);
  const duration = version === 1 ? reader.uint64(durationOffset) : reader.uint32(durationOffset);
  return { timescale, duration, language, complete: timescale !== null && duration !== null };
}

function parseTrackGeometry(
  reader: BoundedMediaReader,
  tkhd: IsoBox | undefined,
): { readonly width: number | null; readonly height: number | null; readonly rotation: CommonMediaInfo['rotationDegrees'] } {
  if (!tkhd) return { width: null, height: null, rotation: null };
  const version = reader.bytes[tkhd.payloadStart];
  const matrixOffset = tkhd.payloadStart + (version === 1 ? 52 : 40);
  const dimensionsOffset = tkhd.payloadStart + (version === 1 ? 88 : 76);
  if (!boxContains(tkhd, matrixOffset, 20) || !boxContains(tkhd, dimensionsOffset, 8)) {
    return { width: null, height: null, rotation: null };
  }
  const widthRaw = reader.uint32(dimensionsOffset);
  const heightRaw = reader.uint32(dimensionsOffset + 4);
  const a = fixed16(reader.int32(matrixOffset));
  const b = fixed16(reader.int32(matrixOffset + 4));
  const c = fixed16(reader.int32(matrixOffset + 12));
  const d = fixed16(reader.int32(matrixOffset + 16));
  return {
    width: widthRaw === null ? null : Math.round(widthRaw / 65_536),
    height: heightRaw === null ? null : Math.round(heightRaw / 65_536),
    rotation: isoRotationFromMatrix(a, b, c, d),
  };
}

function parseSampleDescription(
  reader: BoundedMediaReader,
  stsd: IsoBox | undefined,
  streamType: 'video' | 'audio',
): {
  readonly stream: CommonMediaStreamInfo;
  readonly width: number | null;
  readonly height: number | null;
  readonly colorTransfer: string | null;
  readonly hdr: boolean | null;
  readonly complete: boolean;
} | null {
  if (!stsd) return null;
  const entry = readBoxes(reader, { start: stsd.payloadStart + 8, end: stsd.end })[0];
  if (!entry || !boxContains(entry, entry.start + 32, 4)) return null;
  const codec = codecFromIsoSampleEntry(entry.type);
  const profile = codecProfile(reader, entry, codec);
  const level = codecLevel(reader, entry, codec);
  const bitDepth = boundedBitDepth(codecBitDepth(reader, entry, codec));
  const channels = boundedChannels(streamType === 'audio' ? reader.uint16(entry.start + 24) : null);
  const sampleRateRaw = streamType === 'audio' ? reader.uint32(entry.start + 32) : null;
  const color = streamType === 'video' ? sampleColor(reader, entry) : { transfer: null, hdr: null };
  return {
    stream: {
      type: streamType,
      codec,
      profile,
      level,
      bitDepth,
      channels,
      sampleRate: boundedSampleRate(sampleRateRaw === null ? null : Math.round(sampleRateRaw / 65_536)),
      language: null,
    },
    width: streamType === 'video' ? reader.uint16(entry.start + 32) : null,
    height: streamType === 'video' ? reader.uint16(entry.start + 34) : null,
    colorTransfer: color.transfer,
    hdr: color.hdr,
    complete: codec !== null,
  };
}

function parseSampleTiming(
  reader: BoundedMediaReader,
  stts: IsoBox | undefined,
  timescale: number | null,
): { readonly frameRate: number | null; readonly variableFrameRate: boolean | null; readonly complete: boolean } {
  if (!stts || !timescale) return { frameRate: null, variableFrameRate: null, complete: false };
  if (!boxContains(stts, stts.payloadStart + 4, 4)) {
    return { frameRate: null, variableFrameRate: null, complete: false };
  }
  const entryCount = reader.uint32(stts.payloadStart + 4) ?? 0;
  const count = Math.min(entryCount, MAX_ISO_TIME_TO_SAMPLE_ENTRIES);
  if (!boxContains(stts, stts.payloadStart + 8, count * 8)) {
    return { frameRate: null, variableFrameRate: null, complete: false };
  }
  let samples = 0;
  let ticks = 0;
  const deltas = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const sampleCount = reader.uint32(stts.payloadStart + 8 + index * 8);
    const sampleDelta = reader.uint32(stts.payloadStart + 12 + index * 8);
    if (sampleCount === null || sampleDelta === null) return { frameRate: null, variableFrameRate: null, complete: false };
    samples += sampleCount;
    ticks += sampleCount * sampleDelta;
    deltas.add(sampleDelta);
  }
  const truncated = entryCount > MAX_ISO_TIME_TO_SAMPLE_ENTRIES;
  return {
    frameRate: boundedFrameRate(!truncated && ticks > 0 ? (samples * timescale) / ticks : null),
    variableFrameRate: deltas.size > 1 ? true : truncated || count === 0 ? null : false,
    complete: count > 0 && !truncated,
  };
}

function codecProfile(reader: BoundedMediaReader, entry: IsoBox, codec: string | null): string | null {
  if (codec === 'H.264') {
    const box = nestedSampleBox(reader, entry, 'avcC');
    const profile = box && boxContains(box, box.payloadStart + 1, 1) ? reader.bytes[box.payloadStart + 1] : undefined;
    return profile === undefined ? null : h264ProfileName(profile);
  }
  if (codec === 'HEVC') {
    const box = nestedSampleBox(reader, entry, 'hvcC');
    const profile = box && boxContains(box, box.payloadStart + 1, 1) ? (reader.bytes[box.payloadStart + 1] ?? 0) & 0x1f : undefined;
    return profile === undefined
      ? null
      : profile === 1
        ? 'Main'
        : profile === 2
          ? 'Main 10'
          : profile === 3
            ? 'Main Still Picture'
            : `Profile ${profile}`;
  }
  if (codec === 'ProRes') return proResProfileName(entry.type);
  if (codec === 'AAC') return aacProfile(reader, entry);
  return null;
}

function codecLevel(reader: BoundedMediaReader, entry: IsoBox, codec: string | null): string | null {
  const box = codec === 'H.264' ? nestedSampleBox(reader, entry, 'avcC') : codec === 'HEVC' ? nestedSampleBox(reader, entry, 'hvcC') : null;
  const levelOffset = box ? box.payloadStart + (codec === 'H.264' ? 3 : 12) : -1;
  const level = box && boxContains(box, levelOffset, 1) ? reader.bytes[levelOffset] : undefined;
  if (level === undefined) return null;
  return codec === 'HEVC' ? `${Math.floor(level / 30)}.${Math.floor((level % 30) / 3)}` : `${Math.floor(level / 10)}.${level % 10}`;
}

function codecBitDepth(reader: BoundedMediaReader, entry: IsoBox, codec: string | null): number | null {
  if (codec !== 'HEVC') return codec === 'H.264' ? 8 : null;
  const box = nestedSampleBox(reader, entry, 'hvcC');
  const minusEight = box && boxContains(box, box.payloadStart + 17, 1) ? reader.bytes[box.payloadStart + 17] : undefined;
  return minusEight === undefined ? null : 8 + (minusEight & 0x07);
}

function nestedSampleBox(reader: BoundedMediaReader, entry: IsoBox, type: string): IsoBox | null {
  const headerSize = entry.type === 'mp4a' || entry.type === 'alac' ? 36 : 86;
  return (
    readBoxes(reader, { start: Math.min(entry.start + headerSize, entry.end), end: entry.end }).find((box) => box.type === type) ?? null
  );
}

function sampleColor(reader: BoundedMediaReader, entry: IsoBox): { readonly transfer: string | null; readonly hdr: boolean | null } {
  const colr = nestedSampleBox(reader, entry, 'colr');
  if (!colr || !boxContains(colr, colr.payloadStart, 8) || !['nclx', 'nclc'].includes(reader.ascii(colr.payloadStart, 4) ?? '')) {
    return { transfer: null, hdr: null };
  }
  const code = reader.uint16(colr.payloadStart + 6);
  const transfer = transferName(code);
  return { transfer, hdr: code === 16 || code === 18 ? true : code === null ? null : false };
}

function aacProfile(reader: BoundedMediaReader, entry: IsoBox): string | null {
  const esds = nestedSampleBox(reader, entry, 'esds');
  if (!esds) return null;
  for (let offset = esds.payloadStart + 4; offset + 2 < esds.end; offset += 1) {
    if (reader.bytes[offset] !== 0x05) continue;
    const value = reader.bytes[offset + 2];
    if (value === undefined) return null;
    const objectType = value >> 3;
    return objectType === 2 ? 'LC' : objectType === 5 ? 'HE-AAC' : objectType === 29 ? 'HE-AAC v2' : `Object type ${objectType}`;
  }
  return null;
}

function fixed16(value: number | null): number | null {
  return value === null ? null : value / 65_536;
}

function invalid(message: string, probeLimit = false): CommonMediaProbeResult {
  return { status: 'invalid', reason: probeLimit ? 'probe-limit' : 'malformed', message };
}
