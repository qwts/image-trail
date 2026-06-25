export interface ImageNavigationResult {
  readonly status: 'applied' | 'failed';
  readonly url: string;
  readonly message: string;
}

export interface ImageNavigationSnapshot {
  readonly image: HTMLImageElement;
  readonly src: string;
  readonly srcAttribute: string | null;
  readonly srcset: string | null;
  readonly sizes: string | null;
  readonly sources: readonly SourceNavigationSnapshot[];
}

interface SourceNavigationSnapshot {
  readonly source: HTMLSourceElement;
  readonly srcset: string | null;
  readonly sizes: string | null;
}

export function captureImageNavigationSnapshot(image: HTMLImageElement): ImageNavigationSnapshot {
  const picture = image.closest('picture');
  return {
    image,
    src: image.src,
    srcAttribute: image.getAttribute('src'),
    srcset: image.getAttribute('srcset'),
    sizes: image.getAttribute('sizes'),
    sources: picture
      ? Array.from(picture.querySelectorAll('source')).map((source) => ({
          source,
          srcset: source.getAttribute('srcset'),
          sizes: source.getAttribute('sizes'),
        }))
      : [],
  };
}

export function restoreImageNavigationSnapshot(snapshot: ImageNavigationSnapshot): void {
  for (const source of snapshot.sources) {
    setOptionalAttribute(source.source, 'srcset', source.srcset);
    setOptionalAttribute(source.source, 'sizes', source.sizes);
  }
  setOptionalAttribute(snapshot.image, 'srcset', snapshot.srcset);
  setOptionalAttribute(snapshot.image, 'sizes', snapshot.sizes);
  setOptionalAttribute(snapshot.image, 'src', snapshot.srcAttribute);
  snapshot.image.src = snapshot.src;
}

export function clearResponsiveImageAttributes(image: HTMLImageElement): void {
  image.removeAttribute('srcset');
  image.removeAttribute('sizes');
  const picture = image.closest('picture');
  picture?.querySelectorAll('source').forEach((source) => {
    source.removeAttribute('srcset');
    source.removeAttribute('sizes');
  });
}

export function applyImageUrl(image: HTMLImageElement, url: string): ImageNavigationResult {
  clearResponsiveImageAttributes(image);
  image.src = url;
  return { status: 'applied', url, message: `Applied ${url}` };
}

export function imageResourceUrlsEqual(left: string | null | undefined, right: string | null | undefined, baseUrl?: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  try {
    const base = baseUrl ?? globalThis.location?.href;
    return new URL(left, base).href === new URL(right, base).href;
  } catch {
    return false;
  }
}

function setOptionalAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

export function pushVisibleUrlWhenSameOrigin(
  nextUrl: string,
  location: Location = window.location,
  history: History = window.history,
): boolean {
  const next = new URL(nextUrl, location.href);
  if (next.origin !== location.origin) return false;
  history.pushState(null, '', next.href);
  return true;
}
