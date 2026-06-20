import { fitThumbnailSize, THUMBNAIL_MAX_EDGE } from '../core/image/thumbnail.js';
import {
  createFetchThumbnailSourceMessage,
  isFetchThumbnailSourceResultMessage,
  type FetchThumbnailSourceResultMessage,
} from '../background/messages.js';

export async function createThumbnailDataUrlFromImage(image: HTMLImageElement, maxEdge = THUMBNAIL_MAX_EDGE): Promise<string | null> {
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
  return (
    createThumbnailDataUrlFromDrawable(image, image.naturalWidth, image.naturalHeight, maxEdge) ??
    createThumbnailFromExtensionFetch(image, maxEdge)
  );
}

export async function createThumbnailDataUrlFromUrl(url: string, maxEdge = THUMBNAIL_MAX_EDGE): Promise<string | null> {
  if (!url) return null;
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

async function createThumbnailFromExtensionFetch(image: HTMLImageElement, maxEdge: number): Promise<string | null> {
  const sourceUrl = image.currentSrc || image.src || image.getAttribute('src');
  if (!sourceUrl || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null;

  return createThumbnailDataUrlFromUrl(sourceUrl, maxEdge);
}

export async function fetchThumbnailSource(url: string): Promise<FetchThumbnailSourceResultMessage['payload']> {
  try {
    const response = await chrome.runtime.sendMessage(createFetchThumbnailSourceMessage(url));
    if (isFetchThumbnailSourceResultMessage(response)) return response.payload;
  } catch {
    // Fall through to a null thumbnail.
  }
  return { ok: false, reason: 'unknown', message: 'Thumbnail source fetch failed.' };
}

async function createThumbnailDataUrlFromDataUrl(dataUrl: string, maxEdge: number): Promise<string | null> {
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
