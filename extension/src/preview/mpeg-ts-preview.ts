import mpegts from 'mpegts.js/src/mpegts.js';

import { DEFAULT_MAX_ORIGINAL_BYTES } from '../core/image/capture-result.js';
import { isRemuxableTransportStream, type MpegTsMediaInfo } from '../core/media/mpeg-ts.js';

const MPEG_TS_MSE_CODEC = 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"';
const POSTER_MAX_EDGE = 1_600;
const POSTER_MAX_PIXELS = 4_000_000;
const MEDIA_LOAD_TIMEOUT_MS = 15_000;

interface MpegTsPlayer {
  readonly load: () => void;
  readonly unload: () => void;
  readonly play: () => Promise<void> | void;
  readonly pause: () => void;
  readonly destroy: () => void;
  readonly attachMediaElement: (mediaElement: HTMLMediaElement) => void;
  readonly detachMediaElement: () => void;
  readonly on: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface MpegTsApi {
  readonly createPlayer: (
    mediaDataSource: {
      readonly type: string;
      readonly url: string;
      readonly isLive: boolean;
      readonly cors: boolean;
      readonly filesize: number;
      readonly hasVideo: boolean;
      readonly hasAudio: boolean;
      readonly duration?: number | undefined;
    },
    config: {
      readonly enableWorker: boolean;
      readonly enableWorkerForMSE: boolean;
      readonly enableStashBuffer: boolean;
      readonly stashInitialSize: number;
      readonly lazyLoad: boolean;
      readonly lazyLoadMaxDuration: number;
      readonly lazyLoadRecoverDuration: number;
      readonly autoCleanupSourceBuffer: boolean;
      readonly autoCleanupMaxBackwardDuration: number;
      readonly autoCleanupMinBackwardDuration: number;
      readonly accurateSeek: boolean;
      readonly deferLoadAfterSourceOpen: boolean;
    },
  ) => MpegTsPlayer;
  readonly isSupported: () => boolean;
  readonly Events: { readonly ERROR: string };
}

const mpegTsApi = mpegts as unknown as MpegTsApi;

export interface MpegTsPreviewPayload {
  readonly dataUrl: string;
  readonly mediaInfo: MpegTsMediaInfo;
}

interface AttachedMpegTsPlayer {
  readonly player: MpegTsPlayer;
  readonly objectUrl: string;
  readonly revokeObjectUrl: () => void;
}

export async function createMpegTsPreviewSurface(document: Document, payload: MpegTsPreviewPayload): Promise<HTMLElement> {
  const surface = document.createElement('main');
  surface.className = 'image-trail-preview-media image-trail-preview-media--video';
  const video = createVideoElement(document);

  const status = document.createElement('p');
  status.className = 'image-trail-preview-media__status image-trail-preview-media__video-status';
  status.setAttribute('aria-live', 'polite');
  const codecSummary = payload.mediaInfo.streams.map((stream) => stream.codec ?? 'unknown codec').join(' + ');

  if (!isRemuxableTransportStream(payload.mediaInfo)) {
    status.textContent = `Preserved-only MPEG-TS (${codecSummary || 'no supported streams'}). The exact original remains available for export.`;
    surface.append(preservedOnlyPlaceholder(document), status);
    return surface;
  }
  if (!canRemuxTransportStream(document.defaultView)) {
    status.textContent = `Preserved-only on this device (${codecSummary}). MPEG-TS remux playback is unavailable; the exact original remains available for export.`;
    surface.append(preservedOnlyPlaceholder(document), status);
    return surface;
  }

  let attached: AttachedMpegTsPlayer;
  try {
    attached = attachMpegTsPlayer(document, video, payload);
  } catch {
    status.textContent = 'MPEG-TS preview could not initialize. The exact original remains available for export.';
    surface.append(preservedOnlyPlaceholder(document), status);
    return surface;
  }

  let settled = false;
  const finishLoading = (message: string): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    status.textContent = message;
  };
  const timeout = setTimeout(() => {
    finishLoading('MPEG-TS preview timed out within the bounded load window. The exact original remains available for export.');
    destroy();
  }, MEDIA_LOAD_TIMEOUT_MS);

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(timeout);
    attached.player.pause();
    attached.player.unload();
    attached.player.detachMediaElement();
    attached.player.destroy();
    attached.revokeObjectUrl();
  };
  const onError = (): void => {
    finishLoading('MPEG-TS playback failed safely. The exact original remains available for export.');
  };
  const onLoadedMetadata = (): void => {
    const duration = finitePositive(video.duration) ?? payload.mediaInfo.durationSeconds;
    finishLoading(`MPEG-TS ready (${codecSummary}); duration ${formatDuration(duration)}. Playback is paused.`);
  };
  const onLoadedData = (): void => {
    const poster = posterDataUrlFromVideo(document, video);
    if (poster) video.poster = poster;
  };
  const onPlay = (): void => {
    status.textContent = `MPEG-TS playing (${codecSummary}).`;
  };
  const onPause = (): void => {
    if (video.ended) status.textContent = `MPEG-TS playback complete (${codecSummary}).`;
    else if (settled) status.textContent = `MPEG-TS paused (${codecSummary}).`;
  };

  attached.player.on(mpegTsApi.Events.ERROR, onError);
  video.addEventListener('error', onError);
  video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
  video.addEventListener('loadeddata', onLoadedData, { once: true });
  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  document.defaultView?.addEventListener('pagehide', destroy, { once: true });
  status.textContent = `Preparing bounded MPEG-TS playback (${codecSummary})…`;
  surface.append(video, status);
  attached.player.load();
  return surface;
}

function createVideoElement(document: Document): HTMLVideoElement {
  const video = document.createElement('video');
  video.className = 'image-trail-preview-media__video';
  video.controls = true;
  video.autoplay = false;
  video.preload = 'metadata';
  video.playsInline = true;
  video.setAttribute('aria-label', 'Decrypted MPEG transport-stream original');
  return video;
}

export function canRemuxTransportStream(window: Window | null): boolean {
  const mediaSource = (window as (Window & { readonly MediaSource?: typeof MediaSource }) | null)?.MediaSource;
  return Boolean(mediaSource && mediaSource.isTypeSupported(MPEG_TS_MSE_CODEC) && mpegTsApi.isSupported());
}

function attachMpegTsPlayer(document: Document, video: HTMLVideoElement, payload: MpegTsPreviewPayload): AttachedMpegTsPlayer {
  const bytes = mediaBytesFromDataUrl(payload.dataUrl);
  if (!bytes) throw new Error('Invalid MPEG-TS preview payload.');
  const exactBytes = new Uint8Array(bytes.byteLength);
  exactBytes.set(bytes);
  const blob = new Blob([exactBytes.buffer], { type: 'video/mp2t' });
  const urlApi = document.defaultView?.URL;
  if (!urlApi?.createObjectURL) throw new Error('Blob URLs are unavailable.');
  const objectUrl = urlApi.createObjectURL(blob);
  const player = mpegTsApi.createPlayer(
    {
      type: 'mpegts',
      url: objectUrl,
      isLive: false,
      cors: false,
      filesize: bytes.byteLength,
      hasVideo: true,
      hasAudio: payload.mediaInfo.audioPresent,
      ...(payload.mediaInfo.durationSeconds ? { duration: payload.mediaInfo.durationSeconds * 1_000 } : {}),
    },
    {
      enableWorker: false,
      enableWorkerForMSE: false,
      enableStashBuffer: true,
      stashInitialSize: 1_024,
      lazyLoad: true,
      lazyLoadMaxDuration: 30,
      lazyLoadRecoverDuration: 10,
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 30,
      autoCleanupMinBackwardDuration: 10,
      accurateSeek: true,
      deferLoadAfterSourceOpen: true,
    },
  );
  player.attachMediaElement(video);
  return {
    player,
    objectUrl,
    revokeObjectUrl: () => urlApi.revokeObjectURL(objectUrl),
  };
}

function mediaBytesFromDataUrl(dataUrl: string): Uint8Array | null {
  const match = /^data:video\/mp2t;base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) return null;
  const base64 = match[1]!.replace(/\s/gu, '');
  if (Math.floor((base64.length * 3) / 4) > DEFAULT_MAX_ORIGINAL_BYTES) return null;
  try {
    const binary = atob(base64);
    if (binary.length > DEFAULT_MAX_ORIGINAL_BYTES) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function posterDataUrlFromVideo(document: Document, video: HTMLVideoElement): string | null {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (
    !Number.isSafeInteger(sourceWidth) ||
    !Number.isSafeInteger(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    sourceWidth * sourceHeight > POSTER_MAX_PIXELS
  ) {
    return null;
  }
  const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function preservedOnlyPlaceholder(document: Document): HTMLElement {
  const placeholder = document.createElement('p');
  placeholder.className = 'image-trail-preview-media__placeholder';
  placeholder.textContent = 'Playback unavailable for this transport stream.';
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
