type StyleSnapshot = Pick<CSSStyleDeclaration, 'cursor' | 'opacity' | 'outline' | 'outlineOffset'>;

const snapshots = new WeakMap<HTMLElement, StyleSnapshot>();

function snapshot(element: HTMLElement): void {
  if (snapshots.has(element)) return;
  snapshots.set(element, {
    cursor: element.style.cursor,
    opacity: element.style.opacity,
    outline: element.style.outline,
    outlineOffset: element.style.outlineOffset,
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

export function markSelectedTarget(element: HTMLElement): void {
  snapshot(element);
  element.dataset.imageTrailSelected = 'true';
  element.style.opacity = '1';
  element.style.outline = '4px solid #10b981';
  element.style.outlineOffset = '4px';
}

export function restoreElementStyles(element: HTMLElement): void {
  const original = snapshots.get(element);
  if (original) {
    element.style.cursor = original.cursor;
    element.style.opacity = original.opacity;
    element.style.outline = original.outline;
    element.style.outlineOffset = original.outlineOffset;
    snapshots.delete(element);
  }
  delete element.dataset.imageTrailCandidate;
  delete element.dataset.imageTrailHover;
  delete element.dataset.imageTrailSelected;
}
