import { normalizeDisplayLabel, sourceImageUrlFrom } from '../display-records.js';

const SAFE_MEDIA_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'ts',
  'mts',
  'm2ts',
  'mp4',
  'm4v',
  'm4a',
  'mpeg4',
  'mov',
  'qt',
  'webm',
  'weba',
  'mkv',
  'mka',
  'avi',
  'mpg',
  'mpeg',
  'mp2',
]);
const DATA_MEDIA_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'video/mp2t': 'ts',
  'video/mp4': 'mp4',
  'audio/mp4': 'm4a',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/webm': 'weba',
  'video/x-matroska': 'mkv',
  'audio/x-matroska': 'mka',
  'video/x-msvideo': 'avi',
  'audio/x-msvideo': 'avi',
  'video/mpeg': 'mpg',
  'audio/mpeg': 'mp2',
};
const UNSAFE_FILENAME_FORMAT_CHARACTER = /\p{Cf}/u;

export interface DownloadDuplicateCandidate {
  readonly sourceUrl: string;
  readonly fingerprint?: string | undefined;
}

export interface DownloadDuplicateRecord {
  readonly sourceUrl: string;
  readonly fingerprint?: string | undefined;
}

export interface ImageDownloadRecord {
  readonly id: string;
  readonly url: string;
}

export interface ImageDownloadNameRecord {
  readonly url: string;
  readonly title?: string | undefined;
  readonly label?: string | undefined;
  readonly originalFileName?: string | undefined;
}

export interface SelectImageDownloadUrlsInput {
  readonly history: readonly ImageDownloadRecord[];
  readonly bookmarks: readonly ImageDownloadRecord[];
  readonly selectedHistoryIds: readonly string[];
  readonly selectedBookmarkIds: readonly string[];
  readonly currentImageUrl: string | null;
}

export type DownloadDuplicateMatch = 'fingerprint' | 'url';

export function sanitizeFilename(input: string, fallback = 'image', maxCodePoints?: number): string {
  const withoutControlCharacters = Array.from(input, (character) => (isUnsafeFilenameCharacter(character) ? '_' : character)).join('');
  const sanitized = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/gu, '_')
    .replace(/\s+/gu, ' ')
    .replace(/[._ -]+$/gu, '')
    .replace(/^[._ -]+/gu, '')
    .trim();
  if (!sanitized) return fallback;
  if (maxCodePoints === undefined) return sanitized;
  const bounded = Array.from(sanitized)
    .slice(0, Math.max(1, Math.floor(maxCodePoints)))
    .join('')
    .replace(/[._ -]+$/gu, '')
    .trim();
  return bounded || fallback;
}

function isUnsafeFilenameCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint < 32 || (codePoint >= 0x7f && codePoint <= 0x9f) || UNSAFE_FILENAME_FORMAT_CHARACTER.test(character);
}

export function extensionFromUrl(url: string): string {
  const dataMediaType = /^data:((?:video|audio)\/[a-z0-9.+-]+)[;,]/iu.exec(url)?.[1]?.toLowerCase();
  const dataMediaExtension = dataMediaType ? DATA_MEDIA_EXTENSION_BY_MIME[dataMediaType] : undefined;
  if (dataMediaExtension) return dataMediaExtension;
  const dataImageType = /^data:image\/([a-z0-9.+-]+)[;,]/iu.exec(url)?.[1]?.toLowerCase();
  if (dataImageType) {
    const normalized = dataImageType === 'jpeg' ? 'jpg' : dataImageType;
    return SAFE_MEDIA_EXTENSIONS.has(normalized) ? normalized : 'jpg';
  }
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split('/').filter(Boolean).at(-1) ?? '';
    const extension = filename.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase();
    return extension && SAFE_MEDIA_EXTENSIONS.has(extension) ? extension : 'jpg';
  } catch {
    return 'jpg';
  }
}

export function ensureFilenameExtension(baseName: string, sourceUrl: string): string {
  const clean = sanitizeFilename(baseName);
  return /\.[a-z0-9]{2,5}$/iu.test(clean) ? clean : `${clean}.${extensionFromUrl(sourceUrl)}`;
}

export function alignFilenameWithVerifiedExtension(candidate: string, verifiedExtension: string, fallbackBase: 'image' | 'media'): string {
  const extension = verifiedExtension.toLowerCase();
  const safeExtension = SAFE_MEDIA_EXTENSIONS.has(extension) ? extension : 'bin';
  const sanitized = sanitizeFilename(candidate, fallbackBase, 240);
  const currentExtension = /\.([a-z0-9]{1,10})$/iu.exec(sanitized);
  if (currentExtension?.[1]?.toLowerCase() === safeExtension) return sanitized;
  const stem = currentExtension ? sanitized.slice(0, -currentExtension[0].length) : sanitized;
  return `${sanitizeFilename(stem, fallbackBase, 240 - safeExtension.length - 1)}.${safeExtension}`;
}

export function filenameFromUrl(url: string): string {
  try {
    const parsed = sourceImageUrlFrom(url);
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '');
    return ensureFilenameExtension(name || parsed.hostname || 'image', parsed.href);
  } catch {
    return 'image.jpg';
  }
}

export function filenameFromImageRecord(record: ImageDownloadNameRecord): string {
  const sourceUrl = sourceImageUrlFrom(record.url).href;
  return ensureFilenameExtension(record.originalFileName ?? normalizeDisplayLabel(record), sourceUrl);
}

export function normalizeAbsoluteUrl(url: string, baseUrl?: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

export function findDownloadDuplicate<T extends DownloadDuplicateRecord>(
  records: readonly T[],
  candidate: DownloadDuplicateCandidate,
): { readonly record: T; readonly matchedBy: DownloadDuplicateMatch } | null {
  const candidateFingerprint = safeSha256Fingerprint(candidate.fingerprint);
  if (candidateFingerprint) {
    const fingerprintMatch = records.find((record) => safeSha256Fingerprint(record.fingerprint) === candidateFingerprint);
    if (fingerprintMatch) return { record: fingerprintMatch, matchedBy: 'fingerprint' };
  }

  const urlMatch = records.find((record) => record.sourceUrl === candidate.sourceUrl);
  return urlMatch ? { record: urlMatch, matchedBy: 'url' } : null;
}

export function selectImageDownloadUrls(input: SelectImageDownloadUrlsInput): readonly string[] {
  if (input.selectedHistoryIds.length > 0) {
    return selectedRecordUrls(input.history, input.selectedHistoryIds);
  }
  if (input.selectedBookmarkIds.length > 0) {
    return selectedRecordUrls(input.bookmarks, input.selectedBookmarkIds);
  }
  if (input.currentImageUrl) return [input.currentImageUrl];
  const mostRecentHistoryUrl = input.history[0]?.url;
  return mostRecentHistoryUrl ? [mostRecentHistoryUrl] : [];
}

function safeSha256Fingerprint(value: string | undefined): string | null {
  return value && /^[0-9a-f]{64}$/u.test(value) ? value : null;
}

function selectedRecordUrls(records: readonly ImageDownloadRecord[], selectedIds: readonly string[]): readonly string[] {
  return records.filter((record) => selectedIds.includes(record.id)).map((record) => record.url);
}
