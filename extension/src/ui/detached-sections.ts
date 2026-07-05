import type { DetachableSectionId, PanelState } from '../core/types.js';
import {
  createDetachedSectionWindow,
  DETACHED_WINDOW_INLINE_SIZES,
  type DetachedWindowGeometry,
  type DetachedWindowPosition,
} from './components/detachable-section.js';
import type { PanelRenderTarget } from './render.js';

/** User-facing titles for detachable sections; shared by the header control, placeholder, and window. */
export const DETACHABLE_SECTION_TITLES: Record<DetachableSectionId, string> = {
  history: 'Recent history',
  bookmarks: 'Queue',
  settings: 'Settings',
};

/**
 * Renders a detached section's content for the floating window; render.ts owns the assembly.
 * Returning null skips the window for this render (e.g. detached Settings while Settings is closed).
 */
export type DetachableSectionContentRenderer = (target: PanelRenderTarget, state: PanelState) => HTMLElement | null;

const DETACHED_WINDOW_GAP = 8;
const DETACHED_WINDOW_EDGE_PADDING = 12;
const DETACHED_WINDOW_STACK_OFFSET = 24;
/** A default-positioned window keeps at least this much of itself above the viewport's bottom edge. */
const DETACHED_WINDOW_MIN_VISIBLE_BLOCK_SIZE = 120;

/**
 * Own render pass for detached-section windows, mirroring the recall drawer: a separate root under
 * the shadow host, full swap per render, with per-window list scroll preserved across the swap.
 * Window geometry is session-transient extension-owned state on `PanelLayoutState`.
 */
export function renderDetachedSections(
  target: PanelRenderTarget,
  state: PanelState,
  contentRenderers: Record<DetachableSectionId, DetachableSectionContentRenderer>,
): void {
  const detachedRoot = target.detachedRoot;
  if (!detachedRoot) return;
  // A restored section must not reopen collapsed on its next detach: prune minimized flags for
  // sections that are no longer detached. Window positions are intentionally kept — reopening at
  // the last dragged spot is desired within a session.
  for (const sectionId of Array.from(target.layoutState.detachedWindowMinimized)) {
    if (!state.detachedSections.includes(sectionId)) target.layoutState.detachedWindowMinimized.delete(sectionId);
  }
  if (state.minimized || state.detachedSections.length === 0) {
    detachedRoot.replaceChildren();
    return;
  }

  const previousWindows = new Set<string>();
  const previousListScroll = new Map<string, number>();
  const previousBodyScroll = new Map<string, number>();
  for (const windowEl of Array.from(detachedRoot.querySelectorAll<HTMLElement>('[data-image-trail-detached-window]'))) {
    const sectionId = windowEl.dataset['imageTrailDetachedWindow'];
    if (!sectionId) continue;
    previousWindows.add(sectionId);
    const list = windowEl.querySelector<HTMLElement>('.image-trail-panel__record-list');
    if (list) previousListScroll.set(sectionId, list.scrollTop);
    const body = windowEl.querySelector<HTMLElement>('.image-trail-panel__detached-body');
    if (body) previousBodyScroll.set(sectionId, body.scrollTop);
  }

  detachedRoot.replaceChildren();
  const visibleSections = state.detachedSections
    .map((sectionId) => ({ sectionId, content: contentRenderers[sectionId](target, state) }))
    .filter((entry): entry is { sectionId: DetachableSectionId; content: HTMLElement } => entry.content !== null);
  visibleSections.forEach(({ sectionId, content }) => {
    // Default geometry stacks by the section's stable detach order, not the filtered index —
    // otherwise a hidden neighbor (detached Settings while closed) toggling would shift windows
    // that have no stored position yet.
    const stackIndex = state.detachedSections.indexOf(sectionId);
    const windowEl = createDetachedSectionWindow(
      {
        sectionId,
        sectionTitle: DETACHABLE_SECTION_TITLES[sectionId],
        geometry: detachedWindowGeometry(target.root, sectionId, target.layoutState.detachedWindowPositions.get(sectionId), stackIndex),
        animate: !previousWindows.has(sectionId),
        minimized: target.layoutState.detachedWindowMinimized.has(sectionId),
        onPositionChange: (id, position) => {
          target.layoutState.detachedWindowPositions.set(id, position);
        },
        onMinimizedChange: (id, minimized) => {
          if (minimized) target.layoutState.detachedWindowMinimized.add(id);
          else target.layoutState.detachedWindowMinimized.delete(id);
        },
      },
      content,
      target.dispatch,
    );
    detachedRoot.append(windowEl);

    restoreScroll(windowEl, '.image-trail-panel__record-list', previousListScroll.get(sectionId));
    restoreScroll(windowEl, '.image-trail-panel__detached-body', previousBodyScroll.get(sectionId));
  });
}

function restoreScroll(windowEl: HTMLElement, selector: string, scrollTop: number | undefined): void {
  if (scrollTop === undefined) return;
  const element = windowEl.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.scrollTop = scrollTop;
  queueMicrotask(() => {
    element.scrollTop = scrollTop;
  });
}

function detachedWindowGeometry(
  panelRoot: HTMLElement,
  sectionId: DetachableSectionId,
  stored: DetachedWindowPosition | undefined,
  index: number,
): DetachedWindowGeometry {
  // Mirror the stylesheet's `width: min(<preferred>, calc(100vw - 24px))` — never wider than the
  // viewport, since the inline width would otherwise override the CSS max-width.
  const availableInlineSize = Math.max(0, window.innerWidth - DETACHED_WINDOW_EDGE_PADDING * 2);
  const inlineSize = Math.min(DETACHED_WINDOW_INLINE_SIZES[sectionId], availableInlineSize);
  if (stored) return { ...stored, inlineSize };
  const rect = panelRoot.getBoundingClientRect();
  const stackOffset = index * DETACHED_WINDOW_STACK_OFFSET;
  const maxLeft = window.innerWidth - inlineSize - DETACHED_WINDOW_EDGE_PADDING;
  const left = Math.max(DETACHED_WINDOW_EDGE_PADDING, Math.min(rect.right + DETACHED_WINDOW_GAP + stackOffset, maxLeft));
  const maxTop = window.innerHeight - DETACHED_WINDOW_EDGE_PADDING - DETACHED_WINDOW_MIN_VISIBLE_BLOCK_SIZE;
  const top = Math.max(DETACHED_WINDOW_EDGE_PADDING, Math.min(rect.top + stackOffset, maxTop));
  return { left, top, inlineSize };
}
