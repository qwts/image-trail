type StyleSnapshot = Pick<CSSStyleDeclaration, 'cursor' | 'height' | 'objectFit' | 'opacity' | 'outline' | 'outlineOffset' | 'width'>;
type PageBackdropSnapshot = Pick<CSSStyleDeclaration, 'background' | 'backgroundColor'>;

interface SelectedTargetOptions {
  readonly lockBox?: boolean;
}

const snapshots = new WeakMap<HTMLElement, StyleSnapshot>();
let pageBackdropSnapshot: { readonly body: PageBackdropSnapshot; readonly documentElement: PageBackdropSnapshot } | null = null;

function snapshot(element: HTMLElement): void {
  if (snapshots.has(element)) return;
  snapshots.set(element, {
    cursor: element.style.cursor,
    height: element.style.height,
    objectFit: element.style.objectFit,
    opacity: element.style.opacity,
    outline: element.style.outline,
    outlineOffset: element.style.outlineOffset,
    width: element.style.width,
  });
}

export function markPickModeCandidate(element: HTMLElement): void {
  snapshot(element);
  element.dataset.imageTrailCandidate = 'true';
  element.style.cursor = 'crosshair';
}

export function markHoveredTarget(element: HTMLElement): void {
  snapshot(element);
  element.dataset.imageTrailHover = 'true';
  element.style.outline = '3px dashed #f59e0b';
  element.style.outlineOffset = '3px';
}

export function markSelectedTarget(element: HTMLElement, options: SelectedTargetOptions = {}): void {
  snapshot(element);
  element.style.backgroundColor = '#000';
  element.dataset.imageTrailSelected = 'true';
  if (options.lockBox) {
    element.dataset.imageTrailLockBox = 'true';
    markPageBackdropBlack();
    element.style.height = '100%';
    element.style.objectFit = 'contain';
    element.style.width = '100%';
  }
  element.style.opacity = '1';
  element.style.outline = '4px solid #10b981';
  element.style.outlineOffset = '4px';
}

export function restoreElementStyles(element: HTMLElement): void {
  const original = snapshots.get(element);
  if (original) {
    element.style.cursor = original.cursor;
    element.style.height = original.height;
    element.style.objectFit = original.objectFit;
    element.style.opacity = original.opacity;
    element.style.outline = original.outline;
    element.style.outlineOffset = original.outlineOffset;
    element.style.width = original.width;
    snapshots.delete(element);
  }
  delete element.dataset.imageTrailCandidate;
  delete element.dataset.imageTrailHover;
  if (element.dataset.imageTrailLockBox) restorePageBackdrop();
  delete element.dataset.imageTrailLockBox;
  delete element.dataset.imageTrailSelected;
}

function markPageBackdropBlack(): void {
  if (typeof document === 'undefined' || !document.body || !document.documentElement) return;
  pageBackdropSnapshot ??= {
    body: {
      background: document.body.style.background,
      backgroundColor: document.body.style.backgroundColor,
    },
    documentElement: {
      background: document.documentElement.style.background,
      backgroundColor: document.documentElement.style.backgroundColor,
    },
  };
  document.documentElement.style.background = '#000';
  document.documentElement.style.backgroundColor = '#000';
  document.body.style.background = '#000';
  document.body.style.backgroundColor = '#000';
}

function restorePageBackdrop(): void {
  if (!pageBackdropSnapshot || typeof document === 'undefined' || !document.body || !document.documentElement) {
    pageBackdropSnapshot = null;
    return;
  }
  document.body.style.background = pageBackdropSnapshot.body.background;
  document.body.style.backgroundColor = pageBackdropSnapshot.body.backgroundColor;
  document.documentElement.style.background = pageBackdropSnapshot.documentElement.background;
  document.documentElement.style.backgroundColor = pageBackdropSnapshot.documentElement.backgroundColor;
  pageBackdropSnapshot = null;
}
