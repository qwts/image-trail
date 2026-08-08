import { DEFAULT_MAX_ORIGINAL_BYTES } from '../core/image/capture-result.js';
import { commonMediaLabel, isNativePlaybackCandidate, nativePlaybackType, type CommonMediaInfo } from '../core/media/common-media.js';

const MEDIA_LOAD_TIMEOUT_MS = 15_000;
const POSTER_MAX_EDGE = 1_600;
const POSTER_MAX_PIXELS = 4_000_000;

export interface CommonMediaPreviewPayload {
  readonly dataUrl: string;
  readonly mediaInfo: CommonMediaInfo;
}

export function createCommonMediaPreviewSurface(document: Document, payload: CommonMediaPreviewPayload): HTMLElement {
  const surface = document.createElement('main');
  surface.className = 'image-trail-preview-media image-trail-preview-media--video';
  const status = createStatus(document);
  const label = commonMediaLabel(payload.mediaInfo);
  const codecs = payload.mediaInfo.streams.map((stream) => stream.codec ?? 'unknown codec').join(' + ');
  const decoded = decodeMediaDataUrl(payload.dataUrl);
  if (!decoded || !isNativePlaybackCandidate(payload.mediaInfo)) {
    status.textContent = `Preserved-only ${label} (${codecs || 'unknown streams'}). The exact original remains available for export.`;
    surface.append(preservedOnlyPlaceholder(document, label), status);
    return surface;
  }

  const media = createMediaElement(document, payload.mediaInfo);
  const playbackType = nativePlaybackType(decoded.mimeType, payload.mediaInfo);
  if (media.canPlayType(playbackType) === '') {
    status.textContent = `Preserved-only on this device (${codecs || label}). Native ${label} decoding is unavailable; the exact original remains available for export.`;
    surface.append(preservedOnlyPlaceholder(document, label), status);
    return surface;
  }
  const urlApi = document.defaultView?.URL;
  if (!urlApi?.createObjectURL) {
    status.textContent = `${label} preview could not initialize. The exact original remains available for export.`;
    surface.append(preservedOnlyPlaceholder(document, label), status);
    return surface;
  }

  const bytes = new Uint8Array(decoded.bytes.byteLength);
  bytes.set(decoded.bytes);
  const objectUrl = urlApi.createObjectURL(new Blob([bytes.buffer], { type: decoded.mimeType }));
  activateNativePreview(document, payload.mediaInfo, media, status, label, codecs, urlApi, objectUrl);
  surface.append(media, status);
  return surface;
}

function activateNativePreview(
  document: Document,
  info: CommonMediaInfo,
  media: HTMLVideoElement | HTMLAudioElement,
  status: HTMLParagraphElement,
  label: string,
  codecs: string,
  urlApi: typeof URL,
  objectUrl: string,
): void {
  let destroyed = false;
  let settled = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(timeout);
    media.pause();
    media.removeAttribute('src');
    media.load();
    urlApi.revokeObjectURL(objectUrl);
  };
  const finish = (message: string): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    status.textContent = message;
  };
  const timeout = setTimeout(() => {
    finish(`${label} preview timed out within the bounded load window. The exact original remains available for export.`);
    destroy();
  }, MEDIA_LOAD_TIMEOUT_MS);
  media.addEventListener('loadedmetadata', () => {
    if (destroyed) return;
    const duration = finitePositive(media.duration) ?? info.durationSeconds;
    finish(`${label} ready (${codecs}); duration ${formatDuration(duration)}. Playback is paused.`);
  });
  if (media.tagName === 'VIDEO') {
    const video = media as HTMLVideoElement;
    media.addEventListener(
      'loadeddata',
      () => {
        if (destroyed) return;
        const poster = posterDataUrlFromVideo(document, video);
        if (poster) video.poster = poster;
      },
      { once: true },
    );
  }
  media.addEventListener('play', () => {
    if (destroyed) return;
    status.textContent = `${label} playing (${codecs}).`;
  });
  media.addEventListener('pause', () => {
    if (destroyed) return;
    if (media.ended) status.textContent = `${label} playback complete (${codecs}).`;
    else if (settled) status.textContent = `${label} paused (${codecs}).`;
  });
  media.addEventListener('error', () => {
    if (destroyed) return;
    settled = true;
    clearTimeout(timeout);
    status.textContent = `${label} playback failed safely. The exact original remains available for export.`;
    destroy();
  });
  document.defaultView?.addEventListener('pagehide', destroy, { once: true });
  status.textContent = `Preparing bounded ${label} playback (${codecs})…`;
  media.src = objectUrl;
}

function createMediaElement(document: Document, info: CommonMediaInfo): HTMLVideoElement | HTMLAudioElement {
  const media = document.createElement(info.mediaKind === 'video' ? 'video' : 'audio');
  media.className = info.mediaKind === 'video' ? 'image-trail-preview-media__video' : 'image-trail-preview-media__audio';
  media.controls = true;
  media.autoplay = false;
  media.preload = 'metadata';
  if (media.tagName === 'VIDEO') (media as HTMLVideoElement).playsInline = true;
  media.setAttribute('aria-label', `Decrypted ${commonMediaLabel(info)} original`);
  return media;
}

function createStatus(document: Document): HTMLParagraphElement {
  const status = document.createElement('p');
  status.className = 'image-trail-preview-media__status image-trail-preview-media__video-status';
  status.setAttribute('aria-live', 'polite');
  return status;
}

function decodeMediaDataUrl(dataUrl: string): { readonly mimeType: string; readonly bytes: Uint8Array } | null {
  const match = /^data:((?:video|audio)\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) return null;
  const base64 = match[2]!.replace(/\s/gu, '');
  if (Math.floor((base64.length * 3) / 4) > DEFAULT_MAX_ORIGINAL_BYTES) return null;
  try {
    const binary = atob(base64);
    if (binary.length > DEFAULT_MAX_ORIGINAL_BYTES) return null;
    return { mimeType: match[1]!.toLowerCase(), bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
  } catch {
    return null;
  }
}

function posterDataUrlFromVideo(document: Document, video: HTMLVideoElement): string | null {
  if (
    !Number.isSafeInteger(video.videoWidth) ||
    !Number.isSafeInteger(video.videoHeight) ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0 ||
    video.videoWidth * video.videoHeight > POSTER_MAX_PIXELS
  ) {
    return null;
  }
  const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function preservedOnlyPlaceholder(document: Document, label: string): HTMLElement {
  const placeholder = document.createElement('p');
  placeholder.className = 'image-trail-preview-media__placeholder';
  placeholder.textContent = `Playback unavailable for this ${label} original.`;
  return placeholder;
}

function finitePositive(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'unknown';
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}
