import type { CaptureStatus } from './image/capture-result.js';
import type { StoredOriginalReference } from '../data/types.js';

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

export function normalizeDisplayLabel(record: Pick<ImageDisplayRecord, 'url' | 'title' | 'label'>): string {
  if (record.label?.trim()) {
    return record.label.trim();
  }
  if (record.title?.trim()) {
    return record.title.trim();
  }

  try {
    const parsed = sourceImageUrlFrom(record.url);
    const filename = parsed.pathname.split('/').filter(Boolean).at(-1);
    return filename ? decodeURIComponent(filename) : parsed.hostname;
  } catch {
    return record.url;
  }
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
    const sourceUrl = sourceImageUrlFrom(url);
    return sourceUrl.protocol === 'http:' || sourceUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export function createDisplayRecord(
  input: Omit<ImageDisplayRecord, 'id' | 'label' | 'timestamp'> & Partial<Pick<ImageDisplayRecord, 'id' | 'label' | 'timestamp'>>,
): ImageDisplayRecord {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const id = input.id ?? `${timestamp}:${input.url}`;
  const draft = { ...input, id, timestamp };
  return { ...draft, label: normalizeDisplayLabel(draft) };
}
