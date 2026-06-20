import { fitThumbnailSize, THUMBNAIL_MAX_EDGE } from '../core/image/thumbnail.js';
import {
  createFetchThumbnailSourceMessage,
  isFetchThumbnailSourceResultMessage,
  type FetchThumbnailSourceResultMessage,
} from '../background/messages.js';
import { sendRuntimeMessage } from './runtime-message.js';

export async function createThumbnailDataUrlFromImage(image: HTMLImageElement, maxEdge = THUMBNAIL_MAX_EDGE): Promise<string | null> {
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
  return createThumbnailDataUrlFromDrawable(image, image.naturalWidth, image.naturalHeight, maxEdge);
}

export async function createThumbnailDataUrlFromUrl(url: string, maxEdge = THUMBNAIL_MAX_EDGE): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return createThumbnailDataUrlFromDataUrl(url, maxEdge);
  const result = await fetchThumbnailSource(url);
  if (!result.ok) return null;
  return createThumbnailDataUrlFromDataUrl(result.dataUrl, maxEdge);
}

function createThumbnailDataUrlFromDrawable(
  image: CanvasImageSource,
  width: number,
  height: number,
  maxEdge = THUMBNAIL_MAX_EDGE,
): string | null {
  const size = fitThumbnailSize({ width, height }, maxEdge);
  if (size.width <= 0 || size.height <= 0) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, size.width, size.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

export async function fetchThumbnailSource(url: string): Promise<FetchThumbnailSourceResultMessage['payload']> {
  try {
    const response = await sendRuntimeMessage(createFetchThumbnailSourceMessage(url, document.location.href));
    if (isFetchThumbnailSourceResultMessage(response)) return response.payload;
  } catch {
    // Fall through to a null thumbnail.
  }
  return { ok: false, reason: 'unknown', message: 'Thumbnail source fetch failed.' };
}

export async function createThumbnailDataUrlFromDataUrl(dataUrl: string, maxEdge = THUMBNAIL_MAX_EDGE): Promise<string | null> {
  const image = await loadImage(dataUrl);
  if (!image) return null;
  return createThumbnailDataUrlFromDrawable(image, image.naturalWidth, image.naturalHeight, maxEdge);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
