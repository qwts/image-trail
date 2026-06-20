import type { CaptureStatus, StoredOriginalReference } from './image/capture-result.js';

export interface ImageDisplayRecord {
  readonly id: string;
  readonly url: string;
  readonly title?: string;
  readonly label?: string;
  readonly thumbnail?: string;
  readonly timestamp: string;
  readonly downloadedAt?: string;
  readonly capturedAt?: string;
  readonly source?: 'history' | 'bookmark' | 'favorites';
  readonly captureStatus?: CaptureStatus;
  readonly blobId?: string;
  readonly storedOriginal?: StoredOriginalReference;
}

export const IMAGE_RECORD_EXTENSIONS = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'] as const;

export interface ImageRecordUrlValidation {
  readonly ok: boolean;
  readonly sourceUrl?: string;
  readonly message?: string;
}

export function normalizeDisplayLabel(record: Pick<ImageDisplayRecord, 'url' | 'title' | 'label'>): string {
  if (record.label?.trim()) {
    return record.label.trim();
  }
  if (record.title?.trim()) {
    return record.title.trim();
  }
  if (isDataImageUrl(record.url)) {
    return dataImageDisplayLabel(record.url);
  }

  try {
    const parsed = sourceImageUrlFrom(record.url);
    const filename = parsed.pathname.split('/').filter(Boolean).at(-1);
    return filename ? decodeURIComponent(filename) : parsed.hostname;
  } catch {
    return record.url;
  }
}

export function displayTitleForRecord(record: Pick<ImageDisplayRecord, 'url' | 'label' | 'title'>): string {
  return isDataImageUrl(record.url) ? normalizeDisplayLabel(record) : record.url;
}

export function sourceImageUrlFrom(url: string): URL {
  const parsed = new URL(url);
  for (const key of ['u', 'url', 'imgurl', 'mediaurl']) {
    const sourceUrl = parsed.searchParams.get(key)?.trim();
    if (!sourceUrl) continue;
    try {
      return new URL(sourceUrl);
    } catch {
      // Fall back to the visible URL if the parameter is not itself a URL.
    }
  }
  return parsed;
}

export function isDurableImageSourceUrl(url: string): boolean {
  try {
    const sourceUrl = new URL(url);
    return sourceUrl.protocol === 'http:' || sourceUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export function encryptedBlobIdForRecord(record: Pick<ImageDisplayRecord, 'captureStatus' | 'blobId'>): string | undefined {
  return record.captureStatus === 'captured' ? record.blobId : undefined;
}

export function validateImageRecordUrl(url: string): ImageRecordUrlValidation {
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(url);
  } catch {
    return { ok: false, message: 'Image Trail could not save this URL because it is not a valid URL.' };
  }

  if (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:') {
    return { ok: false, message: 'Only http(s) image URLs can be saved to Image Trail.' };
  }

  return { ok: true, sourceUrl: sourceUrl.href };
}

export function imageExtensionFromUrl(url: string): string | null {
  const dataImageType = imageExtensionFromDataImageUrl(url);
  if (dataImageType) return dataImageType;
  try {
    return imageExtensionFromParsedUrl(sourceImageUrlFrom(url));
  } catch {
    return imageExtensionFromValue(url);
  }
}

export function imageExtensionFromValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleanName = value.split(/[?#]/u)[0];
  const extension = cleanName.match(/\.([a-z0-9]+)$/iu)?.[1]?.toUpperCase();
  if (extension && isImageRecordExtension(extension)) return extension;
  return /(?:^|[/.-])OIP[.-]/iu.test(cleanName) ? 'JPG' : null;
}

function imageExtensionFromParsedUrl(url: URL): string | null {
  return imageExtensionFromValue(url.pathname) ?? imageExtensionFromImageQuery(url);
}

function imageExtensionFromImageQuery(url: URL): string | null {
  for (const key of ['format', 'fm', 'ext', 'type', 'mime', 'mimeType']) {
    const extension = imageExtensionFromImageType(url.searchParams.get(key)?.trim());
    if (extension) return extension;
  }
  return null;
}

function imageExtensionFromImageType(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .toUpperCase()
    .replace(/^IMAGE\//u, '')
    .replace(/^JPE?G$/u, (match) => (match === 'JPG' ? 'JPG' : 'JPEG'));
  return isImageRecordExtension(normalized) ? normalized : null;
}

function isImageRecordExtension(value: string): value is (typeof IMAGE_RECORD_EXTENSIONS)[number] {
  return (IMAGE_RECORD_EXTENSIONS as readonly string[]).includes(value);
}

export function createDisplayRecord(
  input: Omit<ImageDisplayRecord, 'id' | 'label' | 'timestamp'> & Partial<Pick<ImageDisplayRecord, 'id' | 'label' | 'timestamp'>>,
): ImageDisplayRecord {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const id = input.id ?? createDisplayRecordId(timestamp, input.url);
  const draft = { ...input, id, timestamp };
  return { ...draft, label: normalizeDisplayLabel(draft) };
}

function createDisplayRecordId(timestamp: string, url: string): string {
  if (!isDataImageUrl(url)) return `${timestamp}:${url}`;
  const mimeType = dataImageMimeType(url)?.replace(/[^a-z0-9.+-]/giu, '-') ?? 'image';
  return `${timestamp}:data:${mimeType}:${url.length}`;
}

function isDataImageUrl(url: string): boolean {
  return url.startsWith('data:image/');
}

function dataImageDisplayLabel(url: string): string {
  const extension = imageExtensionFromDataImageUrl(url);
  return extension ? `Data URL image (${extension})` : 'Data URL image';
}

function dataImageMimeType(url: string): string | null {
  return /^data:(image\/[a-z0-9.+-]+)[;,]/iu.exec(url)?.[1]?.toLowerCase() ?? null;
}

function imageExtensionFromDataImageUrl(url: string): string | null {
  const subtype = dataImageMimeType(url)?.replace(/^image\//u, '');
  return imageExtensionFromImageType(subtype);
}
