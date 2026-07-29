const MPEG2_CRC_POLYNOMIAL = 0x04c11db7;

export function hasValidMpeg2Crc(section: Uint8Array): boolean {
  return section.byteLength >= 4 && mpeg2Crc32(section) === 0;
}

export function mpeg2Crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc ^ (byte << 24)) >>> 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = ((crc & 0x80000000) !== 0 ? (crc << 1) ^ MPEG2_CRC_POLYNOMIAL : crc << 1) >>> 0;
    }
  }
  return crc;
}
