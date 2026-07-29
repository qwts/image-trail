import type { StoredMediaInfo } from '../core/media/media-info.js';
import { createPreviewMediaSurface } from './animated-preview.js';
import { createMpegTsPreviewSurface } from './mpeg-ts-preview.js';

export interface MediaPreviewPayload {
  readonly dataUrl: string;
  readonly mediaInfo?: StoredMediaInfo | undefined;
}

export async function createMediaPreviewSurface(
  document: Document,
  payload: MediaPreviewPayload,
  options: { readonly reducedMotion: boolean },
): Promise<HTMLElement> {
  if (payload.mediaInfo?.kind === 'mpeg-ts') {
    return createMpegTsPreviewSurface(document, { dataUrl: payload.dataUrl, mediaInfo: payload.mediaInfo });
  }
  return createPreviewMediaSurface(document, { dataUrl: payload.dataUrl, mediaInfo: payload.mediaInfo }, options);
}
