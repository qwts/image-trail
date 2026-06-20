export interface TargetImageInfo {
  readonly handleId: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly source:
    | 'linkSource'
    | 'data-full-src'
    | 'data-image-url'
    | 'data-media-url'
    | 'data-zoom-src'
    | 'currentSrc'
    | 'srcAttribute'
    | 'srcProperty'
    | 'data-src'
    | 'data-original';
}

const MIN_VISIBLE_DIMENSION = 32;
let nextHandleId = 1;
const handles = new WeakMap<HTMLImageElement, string>();

function getHandleId(image: HTMLImageElement): string {
  const existing = handles.get(image);
  if (existing) return existing;
  const handleId = `image-trail-target-${nextHandleId}`;
  nextHandleId += 1;
  handles.set(image, handleId);
  return handleId;
}

export function getImageUrl(image: HTMLImageElement): Pick<TargetImageInfo, 'url' | 'source'> | null {
  const richCandidates: Array<[TargetImageInfo['source'], string | null | undefined]> = [
    ['data-full-src', image.getAttribute('data-full-src')],
    ['data-image-url', image.getAttribute('data-image-url')],
    ['data-media-url', image.getAttribute('data-media-url')],
    ['data-zoom-src', image.getAttribute('data-zoom-src')],
  ];
  const candidates: Array<[TargetImageInfo['source'], string | null | undefined]> = [
    ['currentSrc', image.currentSrc],
    ['srcAttribute', image.getAttribute('src')],
    ['srcProperty', image.src],
    ['data-src', image.getAttribute('data-src')],
    ['data-original', image.getAttribute('data-original')],
  ];

  const linkedSource = sourceUrlFromLink(image);
  const visibleCandidate = candidates.find(([, value]) => value?.trim());
  if (linkedSource && (!visibleCandidate || isLikelyThumbnailUrl(visibleCandidate[1]))) {
    return { source: 'linkSource', url: linkedSource };
  }

  for (const [source, value] of richCandidates) {
    const url = value?.trim();
    if (url) return { source, url };
  }

  for (const [source, value] of candidates) {
    const url = value?.trim();
    if (url) return { source, url };
  }

  return null;
}

function sourceUrlFromLink(image: HTMLImageElement): string | null {
  const href = image.closest('a[href]')?.getAttribute('href')?.trim();
  if (!href) return null;
  try {
    const link = new URL(href, document.baseURI);
    for (const key of ['mediaurl', 'imgurl', 'murl', 'u', 'url']) {
      const sourceUrl = link.searchParams.get(key)?.trim();
      if (!sourceUrl) continue;
      try {
        return new URL(sourceUrl, link.href).href;
      } catch {
        // Keep looking if a wrapper parameter is not URL-like.
      }
    }
    return isLikelyImageUrl(link.href) ? link.href : null;
  } catch {
    return null;
  }
}

function isLikelyThumbnailUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, document.baseURI);
    return (
      url.hostname === 'thf.bing.com' ||
      url.hostname === 'tse1.mm.bing.net' ||
      url.hostname === 'tse2.mm.bing.net' ||
      url.hostname === 'tse3.mm.bing.net' ||
      url.hostname === 'tse4.mm.bing.net' ||
      url.hostname === 'external-content.duckduckgo.com' ||
      url.pathname.includes('/thumbnail') ||
      url.pathname.includes('/thumb/')
    );
  } catch {
    return false;
  }
}

function isLikelyImageUrl(value: string): boolean {
  try {
    const url = new URL(value, document.baseURI);
    return /\.(avif|gif|jpe?g|png|webp)(?:$|[?#])/iu.test(url.href) || url.hostname === 'pbs.twimg.com';
  } catch {
    return false;
  }
}

export function isQualifyingImage(image: HTMLImageElement): boolean {
  if (getImageRejectionReason(image)) return false;
  return true;
}

export function getImageRejectionReason(image: HTMLImageElement): string | null {
  if (!image.isConnected) return 'Image is no longer connected to the page.';
  if (image.closest('#image-trail-panel-root')) return 'Image is inside the Image Trail panel.';
  if (!getImageUrl(image)) return 'Image does not expose a usable source URL.';

  const rect = image.getBoundingClientRect();
  const width = image.naturalWidth || rect.width;
  const height = image.naturalHeight || rect.height;
  if (width < MIN_VISIBLE_DIMENSION || height < MIN_VISIBLE_DIMENSION) return `Image is too small (${Math.round(width)}x${Math.round(height)}).`;

  const style = window.getComputedStyle(image);
  if (style.display === 'none') return 'Image is not displayed.';
  if (style.visibility === 'hidden') return 'Image is hidden.';
  if (Number(style.opacity) === 0) return 'Image is fully transparent.';
  return null;
}

export function createTargetImageInfo(image: HTMLImageElement): TargetImageInfo | null {
  const urlInfo = getImageUrl(image);
  if (!urlInfo) return null;
  const rect = image.getBoundingClientRect();
  return {
    handleId: getHandleId(image),
    url: urlInfo.url,
    width: Math.round(image.naturalWidth || rect.width),
    height: Math.round(image.naturalHeight || rect.height),
    source: urlInfo.source,
  };
}

export function findQualifyingImages(root: ParentNode = document): HTMLImageElement[] {
  return Array.from(root.querySelectorAll('img')).filter(isQualifyingImage);
}
