import { parseMpeg2VideoMetadata } from './mpeg2-video-metadata.js';

const MAX_ELEMENTARY_PROBE_BYTES = 256 * 1024;
const TRANSPORT_PACKET_BYTES = 188;
const H264_HIGH_PROFILES = new Set([44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 144, 244]);

export interface TransportStreamVideoMetadata {
  readonly profile: string | null;
  readonly codedWidth: number | null;
  readonly codedHeight: number | null;
  readonly displayWidth: number | null;
  readonly displayHeight: number | null;
  readonly frameRate: number | null;
  readonly variableFrameRate: boolean;
  readonly hdr: boolean | null;
  readonly colorTransfer: string | null;
}

interface TransportPacketLayout {
  readonly packetSize: 188 | 192;
  readonly syncOffset: 0 | 4;
}

export function probeTransportStreamVideoMetadata(
  bytes: Uint8Array,
  layout: TransportPacketLayout,
  pid: number,
  codec: string,
  headEnd: number,
): TransportStreamVideoMetadata | null {
  try {
    const elementary = collectElementaryPayload(bytes, layout, pid, headEnd);
    if (codec === 'H.264') return parseH264Metadata(elementary);
    if (codec === 'MPEG-2 Video') return parseMpeg2VideoMetadata(elementary);
    return null;
  } catch {
    return null;
  }
}

export function probeAacProfile(bytes: Uint8Array, layout: TransportPacketLayout, pid: number, headEnd: number): string | null {
  const elementary = collectElementaryPayload(bytes, layout, pid, headEnd);
  for (let index = 0; index + 3 < elementary.length; index += 1) {
    if (elementary[index] !== 0xff || ((elementary[index + 1] ?? 0) & 0xf6) !== 0xf0) continue;
    const profile = ((elementary[index + 2] ?? 0) >> 6) + 1;
    return ['Main', 'LC', 'SSR', 'LTP'][profile - 1] ?? `AAC profile ${profile}`;
  }
  return null;
}

function collectElementaryPayload(bytes: Uint8Array, layout: TransportPacketLayout, pid: number, headEnd: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let start = layout.syncOffset; start + TRANSPORT_PACKET_BYTES <= headEnd; start += layout.packetSize) {
    if (bytes[start] !== 0x47) break;
    if (packetPid(bytes, start) !== pid) continue;
    const packetEnd = start + TRANSPORT_PACKET_BYTES;
    const payload = packetPayloadStart(bytes, start, packetEnd);
    if (payload === null) continue;
    const chunk = bytes.subarray(payload, Math.min(packetEnd, payload + MAX_ELEMENTARY_PROBE_BYTES - total));
    chunks.push(chunk);
    total += chunk.length;
    if (total >= MAX_ELEMENTARY_PROBE_BYTES) break;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function packetPid(bytes: Uint8Array, start: number): number {
  return (((bytes[start + 1] ?? 0) & 0x1f) << 8) | (bytes[start + 2] ?? 0);
}

function packetPayloadStart(bytes: Uint8Array, start: number, end: number): number | null {
  const adaptation = ((bytes[start + 3] ?? 0) & 0x30) >> 4;
  if (adaptation === 0 || adaptation === 2) return null;
  let cursor = start + 4;
  if (adaptation === 3) cursor += 1 + (bytes[cursor] ?? end);
  return cursor < end ? cursor : null;
}

function parseH264Metadata(bytes: Uint8Array): TransportStreamVideoMetadata | null {
  const sps = findH264SequenceParameterSet(bytes);
  if (!sps) return null;
  try {
    const reader = new BitReader(removeEmulationPrevention(sps));
    const profileIdc = reader.readBits(8);
    const constraintFlags = reader.readBits(8);
    reader.readBits(8);
    reader.readUnsignedExpGolomb();
    let chromaFormatIdc = 1;
    if (H264_HIGH_PROFILES.has(profileIdc)) {
      chromaFormatIdc = reader.readUnsignedExpGolomb();
      if (chromaFormatIdc > 3) return null;
      if (chromaFormatIdc === 3) reader.readBit();
      reader.readUnsignedExpGolomb();
      reader.readUnsignedExpGolomb();
      reader.readBit();
      if (reader.readBit() === 1) skipScalingMatrices(reader, chromaFormatIdc);
    }
    reader.readUnsignedExpGolomb();
    const pictureOrderCountType = reader.readUnsignedExpGolomb();
    if (pictureOrderCountType === 0) reader.readUnsignedExpGolomb();
    else if (pictureOrderCountType === 1) skipPictureOrderCycle(reader);
    else if (pictureOrderCountType > 2) return null;
    reader.readUnsignedExpGolomb();
    reader.readBit();
    const widthInMacroblocks = reader.readUnsignedExpGolomb() + 1;
    const heightInMapUnits = reader.readUnsignedExpGolomb() + 1;
    const frameMacroblocksOnly = reader.readBit();
    if (frameMacroblocksOnly === 0) reader.readBit();
    reader.readBit();
    const crop = reader.readBit() === 1 ? readCrop(reader) : [0, 0, 0, 0];
    const dimensions = h264Dimensions(widthInMacroblocks, heightInMapUnits, frameMacroblocksOnly, chromaFormatIdc, crop);
    const vui = reader.readBit() === 1 ? readH264Vui(reader) : null;
    const displayWidth = vui?.sar
      ? boundedDimension(Math.round((dimensions.width * vui.sar.numerator) / vui.sar.denominator))
      : dimensions.width;
    return {
      profile: h264ProfileName(profileIdc, constraintFlags),
      codedWidth: dimensions.width,
      codedHeight: dimensions.height,
      displayWidth,
      displayHeight: dimensions.height,
      frameRate: vui?.frameRate ?? null,
      variableFrameRate: vui?.variableFrameRate ?? false,
      hdr: vui?.hdr ?? null,
      colorTransfer: vui?.colorTransfer ?? null,
    };
  } catch {
    return null;
  }
}

function findH264SequenceParameterSet(bytes: Uint8Array): Uint8Array | null {
  for (let offset = 0; offset + 5 < bytes.length; offset += 1) {
    const startLength = startCodeLength(bytes, offset);
    if (startLength === 0) continue;
    const header = offset + startLength;
    if (((bytes[header] ?? 0) & 0x1f) !== 7) continue;
    let end = header + 1;
    while (end < bytes.length && startCodeLength(bytes, end) === 0) end += 1;
    return bytes.subarray(header + 1, end);
  }
  return null;
}

function startCodeLength(bytes: Uint8Array, offset: number): 0 | 3 | 4 {
  if (bytes[offset] !== 0 || bytes[offset + 1] !== 0) return 0;
  if (bytes[offset + 2] === 1) return 3;
  return bytes[offset + 2] === 0 && bytes[offset + 3] === 1 ? 4 : 0;
}

function removeEmulationPrevention(bytes: Uint8Array): Uint8Array {
  const result: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (index >= 2 && bytes[index] === 3 && bytes[index - 1] === 0 && bytes[index - 2] === 0) continue;
    result.push(bytes[index] ?? 0);
  }
  return Uint8Array.from(result);
}

function skipScalingMatrices(reader: BitReader, chromaFormatIdc: number): void {
  const count = chromaFormatIdc === 3 ? 12 : 8;
  for (let index = 0; index < count; index += 1) {
    if (reader.readBit() === 0) continue;
    let lastScale = 8;
    let nextScale = 8;
    const size = index < 6 ? 16 : 64;
    for (let entry = 0; entry < size; entry += 1) {
      if (nextScale !== 0) nextScale = (lastScale + reader.readSignedExpGolomb() + 256) % 256;
      lastScale = nextScale === 0 ? lastScale : nextScale;
    }
  }
}

function skipPictureOrderCycle(reader: BitReader): void {
  reader.readBit();
  reader.readSignedExpGolomb();
  reader.readSignedExpGolomb();
  const cycleLength = reader.readUnsignedExpGolomb();
  if (cycleLength > 256) throw new RangeError('H.264 picture-order cycle exceeds probe bounds.');
  for (let index = 0; index < cycleLength; index += 1) reader.readSignedExpGolomb();
}

function readCrop(reader: BitReader): readonly [number, number, number, number] {
  return [reader.readUnsignedExpGolomb(), reader.readUnsignedExpGolomb(), reader.readUnsignedExpGolomb(), reader.readUnsignedExpGolomb()];
}

function h264Dimensions(
  widthInMacroblocks: number,
  heightInMapUnits: number,
  frameMacroblocksOnly: number,
  chromaFormatIdc: number,
  crop: readonly number[],
): { readonly width: number; readonly height: number } {
  const subWidth = chromaFormatIdc === 3 ? 1 : chromaFormatIdc === 0 ? 1 : 2;
  const subHeight = chromaFormatIdc === 1 ? 2 : 1;
  const cropUnitX = chromaFormatIdc === 0 ? 1 : subWidth;
  const cropUnitY = (chromaFormatIdc === 0 ? 1 : subHeight) * (2 - frameMacroblocksOnly);
  const width = widthInMacroblocks * 16 - ((crop[0] ?? 0) + (crop[1] ?? 0)) * cropUnitX;
  const height = heightInMapUnits * (2 - frameMacroblocksOnly) * 16 - ((crop[2] ?? 0) + (crop[3] ?? 0)) * cropUnitY;
  return { width: boundedDimension(width), height: boundedDimension(height) };
}

function readH264Vui(reader: BitReader): {
  readonly sar: { readonly numerator: number; readonly denominator: number } | null;
  readonly frameRate: number | null;
  readonly variableFrameRate: boolean;
  readonly hdr: boolean | null;
  readonly colorTransfer: string | null;
} {
  const sar = reader.readBit() === 1 ? readSampleAspectRatio(reader) : null;
  if (reader.readBit() === 1) reader.readBit();
  let transfer: number | null = null;
  if (reader.readBit() === 1) {
    reader.readBits(3);
    reader.readBit();
    if (reader.readBit() === 1) {
      reader.readBits(8);
      transfer = reader.readBits(8);
      reader.readBits(8);
    }
  }
  if (reader.readBit() === 1) {
    reader.readUnsignedExpGolomb();
    reader.readUnsignedExpGolomb();
  }
  let frameRate: number | null = null;
  if (reader.readBit() === 1) {
    const units = reader.readBits(32);
    const scale = reader.readBits(32);
    reader.readBit();
    if (units > 0 && scale > 0) frameRate = boundedFrameRate(scale / (2 * units));
  }
  return {
    sar,
    frameRate,
    variableFrameRate: false,
    hdr: transfer === null ? null : transfer === 16 || transfer === 18,
    colorTransfer: transferName(transfer),
  };
}

function readSampleAspectRatio(reader: BitReader): { readonly numerator: number; readonly denominator: number } | null {
  const aspectRatioIdc = reader.readBits(8);
  if (aspectRatioIdc === 255) {
    const numerator = reader.readBits(16);
    const denominator = reader.readBits(16);
    return numerator > 0 && denominator > 0 ? { numerator, denominator } : null;
  }
  const ratio = [
    null,
    [1, 1],
    [12, 11],
    [10, 11],
    [16, 11],
    [40, 33],
    [24, 11],
    [20, 11],
    [32, 11],
    [80, 33],
    [18, 11],
    [15, 11],
    [64, 33],
    [160, 99],
    [4, 3],
    [3, 2],
    [2, 1],
  ][aspectRatioIdc];
  return ratio ? { numerator: ratio[0]!, denominator: ratio[1]! } : null;
}

function h264ProfileName(profileIdc: number, constraintFlags: number): string {
  if (profileIdc === 66) return (constraintFlags & 0x40) !== 0 ? 'Constrained Baseline' : 'Baseline';
  return (
    {
      77: 'Main',
      88: 'Extended',
      100: 'High',
      110: 'High 10',
      122: 'High 4:2:2',
      244: 'High 4:4:4',
    }[profileIdc] ?? `H.264 profile ${profileIdc}`
  );
}

function boundedDimension(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 16_384) throw new RangeError('Media dimension is outside probe bounds.');
  return value;
}

function boundedFrameRate(value: number): number | null {
  return Number.isFinite(value) && value > 0 && value <= 240 ? value : null;
}

function transferName(value: number | null): string | null {
  if (value === null) return null;
  if (value === 1) return 'BT.709';
  if (value === 16) return 'PQ';
  if (value === 18) return 'HLG';
  return `ISO 23001-8 transfer ${value}`;
}

class BitReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readBit(): number {
    if (this.offset >= this.bytes.length * 8) throw new RangeError('Bitstream ended inside metadata.');
    const value = ((this.bytes[Math.floor(this.offset / 8)] ?? 0) >> (7 - (this.offset % 8))) & 1;
    this.offset += 1;
    return value;
  }

  readBits(count: number): number {
    if (!Number.isInteger(count) || count < 0 || count > 32) throw new RangeError('Invalid bit count.');
    let value = 0;
    for (let index = 0; index < count; index += 1) value = value * 2 + this.readBit();
    return value;
  }

  readUnsignedExpGolomb(): number {
    let leadingZeros = 0;
    while (this.readBit() === 0) {
      leadingZeros += 1;
      if (leadingZeros > 30) throw new RangeError('Exp-Golomb value exceeds probe bounds.');
    }
    return 2 ** leadingZeros - 1 + this.readBits(leadingZeros);
  }

  readSignedExpGolomb(): number {
    const code = this.readUnsignedExpGolomb();
    return code % 2 === 0 ? -(code / 2) : (code + 1) / 2;
  }
}
