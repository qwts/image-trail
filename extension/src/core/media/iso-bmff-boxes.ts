import type { BoundedMediaReader, ByteRange } from './binary-media-probe.js';

export interface IsoBox extends ByteRange {
  readonly type: string;
  readonly payloadStart: number;
}

export function readIsoBoxes(reader: BoundedMediaReader, range: ByteRange): IsoBox[] {
  const boxes: IsoBox[] = [];
  let offset = range.start;
  while (offset + 8 <= range.end && reader.countElement()) {
    const size32 = reader.uint32(offset);
    const type = reader.ascii(offset + 4, 4);
    if (size32 === null || type === null) break;
    const headerSize = size32 === 1 ? 16 : 8;
    const size = size32 === 1 ? reader.uint64(offset + 8) : size32 === 0 ? range.end - offset : size32;
    if (size === null || size < headerSize || offset + size > range.end) break;
    boxes.push({ type, start: offset, payloadStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  return boxes;
}

export function childIsoBoxes(reader: BoundedMediaReader, parent: IsoBox): IsoBox[] {
  return readIsoBoxes(reader, { start: parent.payloadStart, end: parent.end });
}

export function isoBrands(reader: BoundedMediaReader, ftyp: IsoBox): string[] {
  const brands: string[] = [];
  for (let offset = ftyp.payloadStart; offset + 4 <= ftyp.end; offset += offset === ftyp.payloadStart ? 8 : 4) {
    const brand = reader.ascii(offset, 4);
    if (brand) brands.push(brand);
  }
  return brands;
}

export function isoBoxContains(box: IsoBox, offset: number, length: number): boolean {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= box.start && length >= 0 && offset + length <= box.end;
}
