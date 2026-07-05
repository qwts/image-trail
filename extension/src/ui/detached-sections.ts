import type { DetachableSectionId, PanelState } from '../core/types.js';
import { createDetachedSectionWindow, type DetachedWindowGeometry, type DetachedWindowPosition } from './components/detachable-section.js';
import type { PanelRenderTarget } from './render.js';

/** User-facing titles for detachable sections; shared by the header control, placeholder, and window. */
export const DETACHABLE_SECTION_TITLES: Record<DetachableSectionId, string> = {
  history: 'Recent history',
};

/** Renders a detached section's content for the floating window; render.ts owns the assembly. */
export type DetachableSectionContentRenderer = (target: PanelRenderTarget, state: PanelState) => HTMLElement;

const DETACHED_WINDOW_INLINE_SIZE = 340;
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
  if (state.minimized || state.detachedSections.length === 0) {
    detachedRoot.replaceChildren();
    return;
  }

  const previousWindows = new Set<string>();
  const previousScroll = new Map<string, number>();
  for (const windowEl of Array.from(detachedRoot.querySelectorAll<HTMLElement>('[data-image-trail-detached-window]'))) {
    const sectionId = windowEl.dataset['imageTrailDetachedWindow'];
    if (!sectionId) continue;
    previousWindows.add(sectionId);
    const list = windowEl.querySelector<HTMLElement>('.image-trail-panel__record-list');
    if (list) previousScroll.set(sectionId, list.scrollTop);
  }

  detachedRoot.replaceChildren();
  state.detachedSections.forEach((sectionId, index) => {
    const windowEl = createDetachedSectionWindow(
      {
        sectionId,
        sectionTitle: DETACHABLE_SECTION_TITLES[sectionId],
        geometry: detachedWindowGeometry(target.root, target.layoutState.detachedWindowPositions.get(sectionId), index),
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
      contentRenderers[sectionId](target, state),
      target.dispatch,
    );
    detachedRoot.append(windowEl);

    const scrollTop = previousScroll.get(sectionId);
    const list = windowEl.querySelector<HTMLElement>('.image-trail-panel__record-list');
    if (list && scrollTop !== undefined) {
      list.scrollTop = scrollTop;
      queueMicrotask(() => {
        list.scrollTop = scrollTop;
      });
    }
  });
}

function detachedWindowGeometry(panelRoot: HTMLElement, stored: DetachedWindowPosition | undefined, index: number): DetachedWindowGeometry {
  // Mirror the stylesheet's `width: min(340px, calc(100vw - 24px))` — never wider than the
  // viewport, since the inline width would otherwise override the CSS max-width.
  const availableInlineSize = Math.max(0, window.innerWidth - DETACHED_WINDOW_EDGE_PADDING * 2);
  const inlineSize = Math.min(DETACHED_WINDOW_INLINE_SIZE, availableInlineSize);
  if (stored) return { ...stored, inlineSize };
  const rect = panelRoot.getBoundingClientRect();
  const stackOffset = index * DETACHED_WINDOW_STACK_OFFSET;
  const maxLeft = window.innerWidth - inlineSize - DETACHED_WINDOW_EDGE_PADDING;
  const left = Math.max(DETACHED_WINDOW_EDGE_PADDING, Math.min(rect.right + DETACHED_WINDOW_GAP + stackOffset, maxLeft));
  const maxTop = window.innerHeight - DETACHED_WINDOW_EDGE_PADDING - DETACHED_WINDOW_MIN_VISIBLE_BLOCK_SIZE;
  const top = Math.max(DETACHED_WINDOW_EDGE_PADDING, Math.min(rect.top + stackOffset, maxTop));
  return { left, top, inlineSize };
}
