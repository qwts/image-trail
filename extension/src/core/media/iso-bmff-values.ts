import { normalizedFileExtension } from './binary-media-probe.js';
import type { CommonMediaInfo } from './common-media-types.js';

export function codecFromIsoSampleEntry(type: string): string | null {
  if (/^avc[13]$/u.test(type)) return 'H.264';
  if (/^(?:hvc1|hev1)$/u.test(type)) return 'HEVC';
  if (type === 'mp4v') return 'MPEG-4 Part 2';
  if (/^(?:apch|apcn|apcs|apco|ap4h|ap4x)$/u.test(type)) return 'ProRes';
  if (type === 'mp4a') return 'AAC';
  if (type === 'alac') return 'ALAC';
  if (type === '.mp3' || type === 'mp3 ') return 'MP3';
  if (type === 'lpcm' || type === 'sowt' || type === 'twos') return 'PCM';
  return type.trim() ? type.trim() : null;
}

export function h264ProfileName(value: number): string {
  return (
    (
      {
        66: 'Baseline',
        77: 'Main',
        88: 'Extended',
        100: 'High',
        110: 'High 10',
        122: 'High 4:2:2',
        144: 'High 4:4:4',
      } as Record<number, string>
    )[value] ?? `Profile ${value}`
  );
}

export function proResProfileName(type: string): string {
  return (
    (
      {
        apco: 'Proxy',
        apcs: 'LT',
        apcn: '422',
        apch: '422 HQ',
        ap4h: '4444',
        ap4x: '4444 XQ',
      } as Record<string, string>
    )[type] ?? type
  );
}

export function transferName(code: number | null): string | null {
  if (code === null) return null;
  return (
    (
      {
        1: 'BT.709',
        6: 'SMPTE 170M',
        13: 'sRGB',
        16: 'PQ (ST 2084)',
        18: 'HLG',
      } as Record<number, string>
    )[code] ?? `Transfer ${code}`
  );
}

export function isoRotationFromMatrix(
  a: number | null,
  b: number | null,
  c: number | null,
  d: number | null,
): CommonMediaInfo['rotationDegrees'] {
  if ([a, b, c, d].some((value) => value === null)) return null;
  const near = (value: number | null, expected: number): boolean => Math.abs((value ?? 0) - expected) < 0.01;
  if (near(a, 1) && near(b, 0) && near(c, 0) && near(d, 1)) return 0;
  if (near(a, 0) && near(b, -1) && near(c, 1) && near(d, 0)) return 90;
  if (near(a, -1) && near(b, 0) && near(c, 0) && near(d, -1)) return 180;
  if (near(a, 0) && near(b, 1) && near(c, -1) && near(d, 0)) return 270;
  return null;
}

export function isoMediaExtension(fileNameOrUrl: string, quickTime: boolean, mediaKind: 'video' | 'audio'): string {
  const extension = normalizedFileExtension(fileNameOrUrl);
  const allowed = quickTime ? ['mov', 'qt'] : mediaKind === 'audio' ? ['m4a', 'mp4'] : ['mp4', 'm4v', 'mpeg4'];
  return extension && allowed.includes(extension) ? extension : quickTime ? 'mov' : mediaKind === 'audio' ? 'm4a' : 'mp4';
}
