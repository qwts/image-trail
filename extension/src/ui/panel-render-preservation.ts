import type { PanelDestinationId } from '../core/types.js';
import { isPanelDestinationId } from './destination-registry.js';
import type { PanelLayoutState, PanelRenderTarget } from './panel-render-types.js';

interface FocusedTextControlSnapshot {
  readonly selector: string;
  readonly value: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
}

interface ScrollSnapshot {
  readonly selector: string | null;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly anchor?: { readonly id: string; readonly top: number } | undefined;
}

export interface PanelRenderSnapshot {
  readonly focusedTextControl: FocusedTextControlSnapshot | null;
  readonly scrollPositions: readonly ScrollSnapshot[];
}

const SCROLL_SNAPSHOT_SELECTORS = [
  '.image-trail-panel__field-list',
  '.image-trail-panel__bookmarks-section .image-trail-panel__record-list',
  '.image-trail-panel__settings-section',
  '.image-trail-panel__help-section',
  '.image-trail-panel__history-section .image-trail-panel__record-list',
] as const;

const COLLAPSIBLE_LIST_SELECTORS = [
  '.image-trail-panel__history-section .image-trail-panel__record-list',
  '.image-trail-panel__bookmarks-section .image-trail-panel__record-list',
] as const;

export function capturePanelRenderSnapshot(target: PanelRenderTarget): PanelRenderSnapshot {
  captureDestinationScroll(target.root, target.layoutState);
  return {
    focusedTextControl: focusedTextControlSnapshot(target.root),
    scrollPositions: scrollSnapshots(target.root, target.layoutState, target.scrollAnchorId),
  };
}

export function restorePanelRenderSnapshot(target: PanelRenderTarget, snapshot: PanelRenderSnapshot): void {
  restoreScrollSnapshots(target.root, snapshot.scrollPositions, target.layoutState);
  restoreFocusedTextControl(target, snapshot.focusedTextControl);
}

export function restoreDestinationScroll(root: HTMLElement, destination: PanelDestinationId | null, layoutState: PanelLayoutState): void {
  if (!destination) return;
  const body = root.querySelector<HTMLElement>(`.image-trail-panel__destination-body[data-destination="${destination}"]`);
  if (!body) return;
  const scrollTarget = destinationScrollTarget(body, destination);
  const scrollTop = layoutState.destinationScrollTops.get(destination) ?? 0;
  const restore = (): void => {
    scrollTarget.scrollTop = scrollTop;
  };
  restore();
  queueMicrotask(restore);
}

export function restorePanelScrollTop(root: HTMLElement, scrollTop: number): void {
  const restore = (): void => {
    root.scrollTop = scrollTop;
  };
  restore();
  queueMicrotask(restore);
}

function captureDestinationScroll(root: HTMLElement, layoutState: PanelLayoutState): void {
  const body = root.querySelector<HTMLElement>('.image-trail-panel__destination-body[data-destination]');
  const destination = body?.dataset['destination'];
  if (body && isPanelDestinationId(destination)) {
    layoutState.destinationScrollTops.set(destination, destinationScrollTarget(body, destination).scrollTop);
  }
}

function destinationScrollTarget(body: HTMLElement, destination: PanelDestinationId): HTMLElement {
  if (destination !== 'settings') return body;
  return body.querySelector<HTMLElement>('.image-trail-panel__settings-section') ?? body;
}

function focusedTextControlSnapshot(root: HTMLElement): FocusedTextControlSnapshot | null {
  const rootNode = root.getRootNode();
  const activeElement = rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement;
  if (!(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)) return null;
  const selector = focusedTextControlSelector(activeElement);
  return selector
    ? {
        selector,
        value: activeElement.value,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd,
      }
    : null;
}

function focusedTextControlSelector(activeElement: HTMLInputElement | HTMLTextAreaElement): string | null {
  if (activeElement.classList.contains('image-trail-panel__password-input')) return '.image-trail-panel__password-input';
  if (activeElement.classList.contains('image-trail-panel__full-url-input')) return '.image-trail-panel__full-url-input';
  if (activeElement.classList.contains('image-trail-panel__field-input') && activeElement.dataset['fieldId']) {
    return `.image-trail-panel__field-input[data-field-id="${CSS.escape(activeElement.dataset['fieldId'])}"]`;
  }
  return null;
}

function restoreFocusedTextControl(target: PanelRenderTarget, snapshot: FocusedTextControlSnapshot | null): void {
  if (!snapshot) return;
  if (snapshot.selector === '.image-trail-panel__full-url-input' && snapshot.value.startsWith('data:')) return;
  const next =
    target.root.querySelector<HTMLInputElement | HTMLTextAreaElement>(snapshot.selector) ??
    target.detachedRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(snapshot.selector);
  if (!next) return;
  next.value = snapshot.value;
  queueMicrotask(() => {
    next.focus({ preventScroll: true });
    if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
      next.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  });
}

function scrollSnapshots(root: HTMLElement, layoutState: PanelLayoutState, scrollAnchorId?: string | null): readonly ScrollSnapshot[] {
  const snapshots: ScrollSnapshot[] = [
    {
      selector: null,
      scrollTop: root.scrollTop,
      scrollLeft: root.scrollLeft,
      anchor: scrollAnchor(root, scrollAnchorId) ?? visibleScrollAnchor(root),
    },
  ];
  for (const selector of SCROLL_SNAPSHOT_SELECTORS) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) {
      snapshots.push({ selector, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft, anchor: visibleScrollAnchor(element) });
    }
  }
  for (const selector of COLLAPSIBLE_LIST_SELECTORS) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) layoutState.collapsibleListScrollTops.set(selector, element.scrollTop);
  }
  return snapshots;
}

function restoreScrollSnapshots(root: HTMLElement, snapshots: readonly ScrollSnapshot[], layoutState: PanelLayoutState): void {
  const snapshotSelectors = new Set(snapshots.map((snapshot) => snapshot.selector));
  const restore = (): void => {
    for (const snapshot of snapshots) restoreScrollSnapshot(root, snapshot);
    for (const selector of COLLAPSIBLE_LIST_SELECTORS) {
      if (snapshotSelectors.has(selector)) continue;
      const remembered = layoutState.collapsibleListScrollTops.get(selector);
      const element = root.querySelector<HTMLElement>(selector);
      if (remembered !== undefined && element) element.scrollTop = remembered;
    }
  };
  restore();
  queueMicrotask(restore);
}

function restoreScrollSnapshot(root: HTMLElement, snapshot: ScrollSnapshot): void {
  const element = snapshot.selector ? root.querySelector<HTMLElement>(snapshot.selector) : root;
  if (!element) return;
  element.scrollTop = snapshot.scrollTop;
  element.scrollLeft = snapshot.scrollLeft;
  restoreScrollAnchor(element, snapshot.anchor);
}

function visibleScrollAnchor(container: HTMLElement): ScrollSnapshot['anchor'] {
  const containerRect = container.getBoundingClientRect();
  const anchors = Array.from(container.querySelectorAll<HTMLElement>('[data-image-trail-scroll-anchor]'));
  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) continue;
    const id = anchor.dataset['imageTrailScrollAnchor'];
    if (id) return { id, top: rect.top };
  }
  return undefined;
}

function scrollAnchor(container: HTMLElement, id?: string | null): ScrollSnapshot['anchor'] {
  if (!id) return undefined;
  const anchor = container.querySelector<HTMLElement>(`[data-image-trail-scroll-anchor="${CSS.escape(id)}"]`);
  return anchor ? { id, top: anchor.getBoundingClientRect().top } : undefined;
}

function restoreScrollAnchor(container: HTMLElement, anchor: ScrollSnapshot['anchor']): void {
  if (!anchor) return;
  const next = container.querySelector<HTMLElement>(`[data-image-trail-scroll-anchor="${CSS.escape(anchor.id)}"]`);
  if (next) container.scrollTop += next.getBoundingClientRect().top - anchor.top;
}
