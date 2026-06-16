export interface TargetImageInfo {
  readonly handleId: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly source: 'currentSrc' | 'srcAttribute' | 'srcProperty' | 'data-src' | 'data-original';
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
  const candidates: Array<[TargetImageInfo['source'], string | null | undefined]> = [
    ['currentSrc', image.currentSrc],
    ['srcAttribute', image.getAttribute('src')],
    ['srcProperty', image.src],
    ['data-src', image.getAttribute('data-src')],
    ['data-original', image.getAttribute('data-original')],
  ];

  for (const [source, value] of candidates) {
    const url = value?.trim();
    if (url) return { source, url };
  }

  return null;
}

export function isQualifyingImage(image: HTMLImageElement): boolean {
  if (!image.isConnected || image.closest('#image-trail-panel-root')) return false;
  if (!getImageUrl(image)) return false;

  const rect = image.getBoundingClientRect();
  const width = image.naturalWidth || rect.width;
  const height = image.naturalHeight || rect.height;
  if (width < MIN_VISIBLE_DIMENSION || height < MIN_VISIBLE_DIMENSION) return false;

  const style = window.getComputedStyle(image);
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
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
