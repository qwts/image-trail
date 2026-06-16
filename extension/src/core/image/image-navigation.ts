export interface ImageNavigationResult {
  readonly status: 'applied' | 'failed';
  readonly url: string;
  readonly message: string;
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

export function pushVisibleUrlWhenSameOrigin(nextUrl: string, location: Location = window.location, history: History = window.history): boolean {
  const next = new URL(nextUrl, location.href);
  if (next.origin !== location.origin) return false;
  history.pushState(null, '', next.href);
  return true;
}
