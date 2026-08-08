import { MAX_COMMON_MEDIA_ELEMENTS, MAX_COMMON_MEDIA_PROBE_BYTES } from './common-media-types.js';

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

export class BoundedMediaReader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  private elements = 0;
  private elementLimitExceeded = false;

  constructor(input: Uint8Array) {
    this.bytes = input;
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }

  countElement(): boolean {
    this.elements += 1;
    if (this.elements <= MAX_COMMON_MEDIA_ELEMENTS) return true;
    this.elementLimitExceeded = true;
    return false;
  }

  get probeLimitExceeded(): boolean {
    return this.elementLimitExceeded;
  }

  contains(offset: number, length: number): boolean {
    return (
      Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= this.bytes.byteLength
    );
  }

  ascii(offset: number, length: number): string | null {
    if (!this.contains(offset, length)) return null;
    return String.fromCharCode(...this.bytes.subarray(offset, offset + length));
  }

  uint16(offset: number, littleEndian = false): number | null {
    return this.contains(offset, 2) ? this.view.getUint16(offset, littleEndian) : null;
  }

  int16(offset: number, littleEndian = false): number | null {
    return this.contains(offset, 2) ? this.view.getInt16(offset, littleEndian) : null;
  }

  uint32(offset: number, littleEndian = false): number | null {
    return this.contains(offset, 4) ? this.view.getUint32(offset, littleEndian) : null;
  }

  int32(offset: number, littleEndian = false): number | null {
    return this.contains(offset, 4) ? this.view.getInt32(offset, littleEndian) : null;
  }

  uint64(offset: number, littleEndian = false): number | null {
    if (!this.contains(offset, 8)) return null;
    const value = this.view.getBigUint64(offset, littleEndian);
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
  }

  float32(offset: number, littleEndian = false): number | null {
    return this.contains(offset, 4) ? this.view.getFloat32(offset, littleEndian) : null;
  }

  float64(offset: number, littleEndian = false): number | null {
    return this.contains(offset, 8) ? this.view.getFloat64(offset, littleEndian) : null;
  }

  find(signature: readonly number[], start = 0, end = Math.min(this.bytes.byteLength, MAX_COMMON_MEDIA_PROBE_BYTES)): number {
    const stop = Math.min(end, this.bytes.byteLength, start + MAX_COMMON_MEDIA_PROBE_BYTES) - signature.length;
    for (let offset = Math.max(0, start); offset <= stop; offset += 1) {
      if (signature.every((value, index) => this.bytes[offset + index] === value)) return offset;
    }
    return -1;
  }
}

export function normalizedFileExtension(fileNameOrUrl: string): string | null {
  let value = fileNameOrUrl;
  try {
    value = new URL(fileNameOrUrl).pathname;
  } catch {
    // A local filename is already the desired input.
  }
  const extension = /\.([a-z0-9]{1,10})$/iu.exec(value)?.[1]?.toLowerCase();
  return extension ?? null;
}

export function safeRatio(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? numerator / denominator
    : null;
}

export function normalizedLanguage(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\0/gu, '').trim();
  return /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/iu.test(normalized) ? normalized.toLowerCase() : null;
}
