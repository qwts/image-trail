import type { GifWebpMediaInfo } from '../core/image/gif-webp-media.js';

export interface PreviewMediaPayload {
  readonly dataUrl: string;
  readonly mediaInfo?: GifWebpMediaInfo | undefined;
}

export interface AnimatedPreviewOptions {
  readonly reducedMotion: boolean;
  readonly createPoster?: ((dataUrl: string, document: Document) => Promise<string | null>) | undefined;
}

const POSTER_MAX_EDGE = 1_600;
const POSTER_TIMEOUT_MS = 10_000;

export async function createPreviewMediaSurface(
  document: Document,
  payload: PreviewMediaPayload,
  options: AnimatedPreviewOptions,
): Promise<HTMLElement> {
  const surface = document.createElement('main');
  surface.className = 'image-trail-preview-media';
  const image = previewImage(document);
  const mediaInfo = payload.mediaInfo;
  if (mediaInfo?.animated !== true || !options.reducedMotion) {
    image.src = payload.dataUrl;
    surface.append(image);
    return surface;
  }

  const poster = await (options.createPoster ?? createStaticPosterDataUrl)(payload.dataUrl, document);
  const placeholder = document.createElement('p');
  placeholder.className = 'image-trail-preview-media__placeholder';
  placeholder.textContent = 'Animation paused to honor reduced motion.';
  if (poster) image.src = poster;

  const controls = document.createElement('div');
  controls.className = 'image-trail-preview-media__controls';
  const status = document.createElement('p');
  status.className = 'image-trail-preview-media__status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = mediaStatus(mediaInfo, false);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Play animation';
  toggle.setAttribute('aria-pressed', 'false');
  let playing = false;

  const showPoster = (): void => {
    playing = false;
    toggle.textContent = 'Play animation';
    toggle.setAttribute('aria-pressed', 'false');
    status.textContent = mediaStatus(mediaInfo, false);
    if (poster) {
      image.src = poster;
      surface.replaceChildren(image, controls);
    } else {
      image.removeAttribute('src');
      surface.replaceChildren(placeholder, controls);
    }
  };
  const showAnimation = (): void => {
    playing = true;
    toggle.textContent = 'Stop animation';
    toggle.setAttribute('aria-pressed', 'true');
    status.textContent = mediaStatus(mediaInfo, true);
    image.src = payload.dataUrl;
    surface.replaceChildren(image, controls);
  };
  toggle.addEventListener('click', () => {
    if (playing) showPoster();
    else showAnimation();
  });
  controls.append(toggle, status);
  showPoster();
  return surface;
}

export function mediaStatus(mediaInfo: GifWebpMediaInfo, playing: boolean): string {
  const format = mediaInfo.kind === 'gif' ? 'GIF' : 'WebP';
  const loop =
    mediaInfo.loopCount === 0
      ? 'loops continuously'
      : mediaInfo.loopCount === null
        ? 'has no declared loop'
        : `loops ${mediaInfo.loopCount} times`;
  return `${format} animation, ${mediaInfo.frameCount} frames, ${loop}; ${playing ? 'playing' : 'paused'}.`;
}

async function createStaticPosterDataUrl(dataUrl: string, document: Document): Promise<string | null> {
  const source = document.createElement('img');
  const loaded = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), POSTER_TIMEOUT_MS);
    source.addEventListener(
      'load',
      () => {
        clearTimeout(timeout);
        resolve(true);
      },
      { once: true },
    );
    source.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        resolve(false);
      },
      { once: true },
    );
    source.src = dataUrl;
  });
  if (!loaded || source.naturalWidth <= 0 || source.naturalHeight <= 0) return null;
  const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(source.naturalWidth, source.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  try {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function previewImage(document: Document): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'image-trail-preview-media__image';
  image.alt = 'Decrypted Image Trail original';
  return image;
}
