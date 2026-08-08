import { inspectAviMedia } from './avi-media.js';
import { inspectEbmlMedia } from './ebml-media.js';
import { inspectIsoBmffMedia } from './iso-bmff-media.js';
import { inspectMpegProgramMedia } from './mpeg-program-media.js';
import type { CommonMediaInfo, CommonMediaProbeResult, CommonMediaStreamInfo } from './common-media-types.js';

const COMMON_MEDIA_MIME_TYPES = new Set([
  'video/mp4',
  'audio/mp4',
  'video/quicktime',
  'video/webm',
  'audio/webm',
  'video/x-matroska',
  'audio/x-matroska',
  'video/x-msvideo',
  'audio/x-msvideo',
  'video/mpeg',
  'audio/mpeg',
]);
const COMMON_MEDIA_EXTENSION = /\.(?:mp4|m4v|m4a|mpeg4|mov|qt|webm|weba|mkv|mka|avi|mpg|mpeg|mp2)$/iu;

export type { CommonMediaInfo, CommonMediaProbe, CommonMediaProbeResult, CommonMediaStreamInfo } from './common-media-types.js';

export function inspectCommonMedia(bytes: Uint8Array, declaredMimeType = '', fileNameOrUrl = ''): CommonMediaProbeResult {
  for (const inspect of [inspectIsoBmffMedia, inspectEbmlMedia, inspectAviMedia, inspectMpegProgramMedia] as const) {
    const result = inspect(bytes, declaredMimeType, fileNameOrUrl);
    if (result.status !== 'not-common-media') return result;
  }
  return commonMediaHint(declaredMimeType, fileNameOrUrl)
    ? {
        status: 'invalid',
        reason: 'malformed',
        message:
          'Declared common media does not match a validated ISO BMFF, QuickTime, WebM, Matroska, AVI, MPEG program, or MP2 signature.',
      }
    : { status: 'not-common-media' };
}

export function commonMediaHint(declaredMimeType: string, fileNameOrUrl: string): boolean {
  return (
    COMMON_MEDIA_MIME_TYPES.has(declaredMimeType.split(';')[0]?.trim().toLowerCase() ?? '') ||
    COMMON_MEDIA_EXTENSION.test(pathname(fileNameOrUrl))
  );
}

export function isNativePlaybackCandidate(mediaInfo: CommonMediaInfo): boolean {
  const video = mediaInfo.streams.filter((stream) => stream.type === 'video');
  const audio = mediaInfo.streams.filter((stream) => stream.type === 'audio');
  if (!nativeStreamShapeMatches(mediaInfo.mediaKind, video.length, audio.length)) return false;
  if (mediaInfo.container === 'Matroska' || mediaInfo.container === 'AVI' || mediaInfo.container === 'MPEG-PS') return false;
  if (mediaInfo.container === 'MPEG-Audio') return audio.every((stream) => stream.codec === 'MP3');
  if (mediaInfo.container === 'WebM') {
    return (
      video.every((stream) => ['VP8', 'VP9', 'AV1'].includes(stream.codec ?? '')) &&
      audio.every((stream) => ['Opus', 'Vorbis'].includes(stream.codec ?? ''))
    );
  }
  if (mediaInfo.container === 'ISO-BMFF' || mediaInfo.container === 'QuickTime') {
    return video.every(isoVideoCandidate) && audio.every((stream) => ['AAC', 'ALAC', 'MP3', 'PCM'].includes(stream.codec ?? ''));
  }
  return false;
}

function nativeStreamShapeMatches(mediaKind: CommonMediaInfo['mediaKind'], videoCount: number, audioCount: number): boolean {
  return mediaKind === 'video' ? videoCount === 1 : videoCount === 0 && audioCount > 0;
}

export function nativePlaybackType(mimeType: string, mediaInfo: CommonMediaInfo): string {
  const codecs = mediaInfo.streams
    .filter((stream) => stream.type === 'video' || stream.type === 'audio')
    .map(codecParameter)
    .filter((codec): codec is string => codec !== null);
  return codecs.length === 0 ? mimeType : `${mimeType}; codecs="${codecs.join(',')}"`;
}

export function commonMediaLabel(mediaInfo: CommonMediaInfo): string {
  if (mediaInfo.container === 'ISO-BMFF') return mediaInfo.mediaKind === 'audio' ? 'M4A' : 'MP4';
  if (mediaInfo.container === 'QuickTime') return 'MOV';
  if (mediaInfo.container === 'Matroska') return mediaInfo.mediaKind === 'audio' ? 'MKA' : 'MKV';
  if (mediaInfo.container === 'MPEG-Audio') return 'MP2';
  if (mediaInfo.container === 'MPEG-PS') return 'MPEG';
  return mediaInfo.container.toUpperCase();
}

function isoVideoCandidate(stream: CommonMediaStreamInfo): boolean {
  if (stream.codec === 'H.264') return stream.bitDepth === null || stream.bitDepth <= 8;
  if (stream.codec === 'HEVC') return stream.profile === 'Main' || stream.profile === 'Main 10';
  return stream.codec === 'ProRes';
}

function codecParameter(stream: CommonMediaStreamInfo): string | null {
  if (stream.codec === 'H.264') return h264CodecParameter(stream);
  if (stream.codec === 'HEVC') return hevcCodecParameter(stream);
  if (stream.codec === 'ProRes') return proResCodecParameter(stream.profile);
  if (stream.codec === 'VP8') return 'vp8';
  if (stream.codec === 'VP9') return 'vp09.00.10.08';
  if (stream.codec === 'AV1') return 'av01.0.04M.08';
  if (stream.codec === 'AAC') return stream.profile === 'HE-AAC' ? 'mp4a.40.5' : 'mp4a.40.2';
  if (stream.codec === 'Opus') return 'opus';
  if (stream.codec === 'Vorbis') return 'vorbis';
  if (stream.codec === 'MP3') return 'mp3';
  if (stream.codec === 'ALAC') return 'alac';
  return null;
}

function h264CodecParameter(stream: CommonMediaStreamInfo): string {
  const profileAndCompatibility =
    ({ Baseline: '42e0', Main: '4d40', Extended: '5800', High: '6400' } as Record<string, string>)[stream.profile ?? ''] ?? '4200';
  const level = boundedLevelIdc(stream.level, 10, 30, 10).toString(16).padStart(2, '0');
  return `avc1.${profileAndCompatibility}${level}`;
}

function hevcCodecParameter(stream: CommonMediaStreamInfo): string {
  const level = boundedLevelIdc(stream.level, 30, stream.profile === 'Main 10' ? 120 : 93, 30);
  return stream.profile === 'Main 10' ? `hvc1.2.4.L${level}.B0` : `hvc1.1.6.L${level}.B0`;
}

function boundedLevelIdc(value: string | null, multiplier: number, fallback: number, minimum: number): number {
  const parsed = value === null ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(255, Math.round(parsed * multiplier))) : fallback;
}

function proResCodecParameter(profile: string | null): string {
  return (
    (
      {
        Proxy: 'apco',
        LT: 'apcs',
        '422': 'apcn',
        '422 HQ': 'apch',
        '4444': 'ap4h',
        '4444 XQ': 'ap4x',
      } as Record<string, string>
    )[profile ?? ''] ?? 'apch'
  );
}

function pathname(fileNameOrUrl: string): string {
  try {
    return new URL(fileNameOrUrl).pathname;
  } catch {
    return fileNameOrUrl;
  }
}
