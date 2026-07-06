import { recordHasStoredOriginal, type ImageDisplayRecord } from '../core/display-records.js';

export type GalleryOpenAction =
  | { readonly kind: 'open-url'; readonly url: string }
  | { readonly kind: 'preview-data-url'; readonly dataUrl: string }
  | { readonly kind: 'preview-blob'; readonly blobId: string }
  | { readonly kind: 'locked'; readonly message: string }
  | { readonly kind: 'unsupported'; readonly message: string };

export function openActionForGalleryRecord(record: ImageDisplayRecord, options: { readonly blobKeyUnlocked: boolean }): GalleryOpenAction {
  if (record.privacyStatus === 'locked') {
    return { kind: 'locked', message: 'Unlock encrypted originals to view this private pin.' };
  }

  const blobId = blobIdForStoredOriginal(record);
  if (recordHasStoredOriginal(record)) {
    if (!options.blobKeyUnlocked || !blobId) {
      return { kind: 'locked', message: 'Unlock encrypted originals to view the captured original.' };
    }
    return { kind: 'preview-blob', blobId };
  }

  if (record.url.startsWith('data:image/')) {
    return { kind: 'preview-data-url', dataUrl: record.url };
  }

  if (isHttpUrl(record.url)) {
    return { kind: 'open-url', url: record.url };
  }

  return { kind: 'unsupported', message: 'This saved record does not have an openable image URL.' };
}

export function galleryRecordKind(record: ImageDisplayRecord): 'Captured original' | 'URL-only pin' | 'Locked private pin' {
  if (record.privacyStatus === 'locked') return 'Locked private pin';
  return recordHasStoredOriginal(record) ? 'Captured original' : 'URL-only pin';
}

function blobIdForStoredOriginal(record: ImageDisplayRecord): string | undefined {
  return record.storedOriginal?.blobId ?? record.blobId ?? record.protectedPin?.storedOriginalBlobId;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
