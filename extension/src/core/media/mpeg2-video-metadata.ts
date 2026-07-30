const MPEG2_FRAME_RATES: Readonly<Record<number, number>> = {
  1: 24_000 / 1_001,
  2: 24,
  3: 25,
  4: 30_000 / 1_001,
  5: 30,
  6: 50,
  7: 60_000 / 1_001,
  8: 60,
};

export interface Mpeg2VideoMetadata {
  readonly profile: string | null;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly frameRate: number | null;
  readonly variableFrameRate: false;
  readonly hdr: boolean | null;
  readonly colorTransfer: string | null;
}

export function parseMpeg2VideoMetadata(bytes: Uint8Array): Mpeg2VideoMetadata | null {
  const offset = findStartCode(bytes, 0xb3);
  if (offset < 0 || offset + 7 >= bytes.length) return null;
  const baseWidth = ((bytes[offset + 4] ?? 0) << 4) | ((bytes[offset + 5] ?? 0) >> 4);
  const baseHeight = (((bytes[offset + 5] ?? 0) & 0x0f) << 8) | (bytes[offset + 6] ?? 0);
  const aspectRatio = (bytes[offset + 7] ?? 0) >> 4;
  const extension = readSequenceExtension(bytes);
  const codedWidth = boundedDimension(baseWidth | ((extension?.widthExtension ?? 0) << 12));
  const codedHeight = boundedDimension(baseHeight | ((extension?.heightExtension ?? 0) << 12));
  const baseFrameRate = MPEG2_FRAME_RATES[(bytes[offset + 7] ?? 0) & 0x0f] ?? null;
  const frameRate =
    baseFrameRate === null
      ? null
      : boundedFrameRate((baseFrameRate * (extension?.frameRateNumerator ?? 1)) / (extension?.frameRateDenominator ?? 1));
  const display = readDisplayExtension(bytes);
  return {
    profile: extension?.profile ?? null,
    codedWidth,
    codedHeight,
    displayWidth: display?.width ?? displayWidthFromAspectRatio(codedWidth, codedHeight, aspectRatio),
    displayHeight: display?.height ?? codedHeight,
    frameRate,
    variableFrameRate: false,
    hdr: display?.hdr ?? null,
    colorTransfer: display?.colorTransfer ?? null,
  };
}

function readSequenceExtension(bytes: Uint8Array): {
  readonly profile: string | null;
  readonly widthExtension: number;
  readonly heightExtension: number;
  readonly frameRateNumerator: number;
  readonly frameRateDenominator: number;
} | null {
  const offset = findExtension(bytes, 1);
  if (offset < 0) return null;
  try {
    const reader = new BitReader(bytes.subarray(offset + 4));
    reader.readBits(4);
    const profileAndLevel = reader.readBits(8);
    reader.readBit();
    reader.readBits(2);
    const widthExtension = reader.readBits(2);
    const heightExtension = reader.readBits(2);
    reader.readBits(12);
    reader.readBit();
    reader.readBits(8);
    reader.readBit();
    const frameRateNumerator = reader.readBits(2) + 1;
    const frameRateDenominator = reader.readBits(5) + 1;
    return {
      profile:
        {
          1: 'High',
          2: 'Spatially Scalable',
          3: 'SNR Scalable',
          4: 'Main',
          5: 'Simple',
        }[(profileAndLevel >> 4) & 0x07] ?? null,
      widthExtension,
      heightExtension,
      frameRateNumerator,
      frameRateDenominator,
    };
  } catch {
    return null;
  }
}

function readDisplayExtension(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
  readonly hdr: boolean | null;
  readonly colorTransfer: string | null;
} | null {
  const offset = findExtension(bytes, 2);
  if (offset < 0) return null;
  try {
    const reader = new BitReader(bytes.subarray(offset + 4));
    reader.readBits(4);
    reader.readBits(3);
    let transfer: number | null = null;
    if (reader.readBit() === 1) {
      reader.readBits(8);
      transfer = reader.readBits(8);
      reader.readBits(8);
    }
    const width = boundedDimension(reader.readBits(14));
    reader.readBit();
    const height = boundedDimension(reader.readBits(14));
    return {
      width,
      height,
      hdr: transfer === null ? null : transfer === 16 || transfer === 18,
      colorTransfer: transferName(transfer),
    };
  } catch {
    return null;
  }
}

function findStartCode(bytes: Uint8Array, code: number): number {
  for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
    if (bytes[offset] === 0 && bytes[offset + 1] === 0 && bytes[offset + 2] === 1 && bytes[offset + 3] === code) return offset;
  }
  return -1;
}

function findExtension(bytes: Uint8Array, extensionId: number): number {
  for (let offset = 0; offset + 5 <= bytes.length; offset += 1) {
    if (
      bytes[offset] === 0 &&
      bytes[offset + 1] === 0 &&
      bytes[offset + 2] === 1 &&
      bytes[offset + 3] === 0xb5 &&
      (bytes[offset + 4] ?? 0) >> 4 === extensionId
    ) {
      return offset;
    }
  }
  return -1;
}

function displayWidthFromAspectRatio(width: number, height: number, aspectRatio: number): number {
  const ratio = { 2: 4 / 3, 3: 16 / 9, 4: 2.21 }[aspectRatio];
  return ratio ? boundedDimension(Math.round(height * ratio)) : width;
}

function boundedDimension(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 16_384) {
    throw new RangeError('MPEG-2 dimension is outside probe bounds.');
  }
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
    if (this.offset >= this.bytes.length * 8) throw new RangeError('Bitstream ended inside MPEG-2 metadata.');
    const value = ((this.bytes[Math.floor(this.offset / 8)] ?? 0) >> (7 - (this.offset % 8))) & 1;
    this.offset += 1;
    return value;
  }

  readBits(count: number): number {
    if (!Number.isInteger(count) || count < 0 || count > 32) throw new RangeError('Invalid MPEG-2 bit count.');
    let value = 0;
    for (let index = 0; index < count; index += 1) value = value * 2 + this.readBit();
    return value;
  }
}
