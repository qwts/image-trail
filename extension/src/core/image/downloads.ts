const SAFE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

export interface DownloadDuplicateCandidate {
  readonly sourceUrl: string;
  readonly fingerprint?: string;
}

export interface DownloadDuplicateRecord {
  readonly sourceUrl: string;
  readonly fingerprint?: string;
}

export type DownloadDuplicateMatch = 'fingerprint' | 'url';

export function sanitizeFilename(input: string, fallback = 'image'): string {
  const withoutControlCharacters = Array.from(input, (character) => ((character.codePointAt(0) ?? 0) < 32 ? '_' : character)).join('');
  const sanitized = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/gu, '_')
    .replace(/\s+/gu, ' ')
    .replace(/[._ -]+$/gu, '')
    .replace(/^[._ -]+/gu, '')
    .trim();
  return sanitized || fallback;
}

export function extensionFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split('/').filter(Boolean).at(-1) ?? '';
    const extension = filename.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase();
    return extension && SAFE_IMAGE_EXTENSIONS.has(extension) ? extension : 'jpg';
  } catch {
    return 'jpg';
  }
}

export function ensureFilenameExtension(baseName: string, sourceUrl: string): string {
  const clean = sanitizeFilename(baseName);
  return /\.[a-z0-9]{2,5}$/iu.test(clean) ? clean : `${clean}.${extensionFromUrl(sourceUrl)}`;
}

export function filenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '');
    return ensureFilenameExtension(name || parsed.hostname || 'image', url);
  } catch {
    return 'image.jpg';
  }
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

function safeSha256Fingerprint(value: string | undefined): string | null {
  return value && /^[0-9a-f]{64}$/u.test(value) ? value : null;
}
