import type { DetachableSectionId, PanelAction } from '../../core/types.js';
import { clampPanelPosition } from '../panel-position.js';

export interface DetachedWindowPosition {
  readonly left: number;
  readonly top: number;
}

export interface DetachedWindowGeometry extends DetachedWindowPosition {
  readonly inlineSize: number;
}

type DetachDispatch = (action: PanelAction) => void;

const DRAG_OUT_THRESHOLD_PX = 6;
const DRAG_GHOST_BLOCK_SIZE = 160;

/**
 * Preferred window widths per section; Settings gets the panel's width for its dense forms. Owned
 * here so the drag-out ghost/clamp and the detached render pass share one source of truth.
 */
export const DETACHED_WINDOW_INLINE_SIZES: Record<DetachableSectionId, number> = {
  history: 340,
  bookmarks: 340,
  settings: 420,
};

/**
 * Keyboard-accessible detach control rendered inside a section's own header. Click (or Enter/Space)
 * detaches at the default position; press-and-drag past a small threshold shows a drop ghost and
 * detaches with the window opening where it was released (`onDragOutPosition` seeds the position
 * before the dispatch). The floating window is extension-owned; this only dispatches — window
 * creation happens on the detached render pass.
 */
export function createSectionDetachControl(
  sectionId: DetachableSectionId,
  sectionTitle: string,
  dispatch: DetachDispatch,
  options: { readonly onDragOutPosition?: (sectionId: DetachableSectionId, position: DetachedWindowPosition) => void } = {},
): HTMLElement {
  const detach = document.createElement('button');
  detach.type = 'button';
  detach.className = 'image-trail-panel__icon-button image-trail-panel__section-detach';
  detach.textContent = '⧉';
  detach.dataset['imageTrailDetach'] = sectionId;
  detach.setAttribute('aria-label', `Detach ${sectionTitle} into a floating window (drag to place)`);
  detach.title = `Detach ${sectionTitle} into a floating window (drag to place)`;
  let suppressClick = false;
  detach.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    dispatch({ name: 'section/detach', sectionId });
  });
  detach.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !options.onDragOutPosition) return;
    // Capture immediately: once the pointer leaves this small button, move/up events would
    // otherwise target whatever is under the cursor and the drag would never engage.
    if (typeof detach.setPointerCapture === 'function') detach.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    let ghost: HTMLElement | null = null;

    // Clamp against the section's actual window width — a fixed ghost size would let a wider
    // window (Settings, 420px) store a drop position that renders partially off-screen.
    const windowInlineSize = DETACHED_WINDOW_INLINE_SIZES[sectionId];
    const dropPosition = (move: PointerEvent): DetachedWindowPosition =>
      clampPanelPosition(
        { left: move.clientX - 24, top: move.clientY - 12 },
        { width: windowInlineSize, height: DRAG_GHOST_BLOCK_SIZE },
        { width: window.innerWidth, height: window.innerHeight },
      );
    const onMove = (move: PointerEvent): void => {
      if (!ghost) {
        if (Math.abs(move.clientX - startX) < DRAG_OUT_THRESHOLD_PX && Math.abs(move.clientY - startY) < DRAG_OUT_THRESHOLD_PX) return;
        ghost = document.createElement('div');
        ghost.className = 'image-trail-panel__detach-ghost';
        ghost.style.width = `${windowInlineSize}px`;
        ghost.style.height = `${DRAG_GHOST_BLOCK_SIZE}px`;
        const rootNode = detach.getRootNode();
        (rootNode instanceof ShadowRoot ? rootNode : document.body).append(ghost);
      }
      const position = dropPosition(move);
      ghost.style.left = `${position.left}px`;
      ghost.style.top = `${position.top}px`;
    };
    const cleanup = (): void => {
      detach.removeEventListener('pointermove', onMove);
      detach.removeEventListener('pointerup', onUp);
      detach.removeEventListener('pointercancel', onCancel);
      if (typeof detach.releasePointerCapture === 'function') detach.releasePointerCapture(event.pointerId);
      ghost?.remove();
    };
    const onUp = (up: PointerEvent): void => {
      const dragged = ghost !== null;
      cleanup();
      if (!dragged) return;
      suppressClick = true;
      options.onDragOutPosition?.(sectionId, dropPosition(up));
      dispatch({ name: 'section/detach', sectionId });
    };
    const onCancel = (): void => {
      cleanup();
      suppressClick = ghost !== null;
    };
    detach.addEventListener('pointermove', onMove);
    detach.addEventListener('pointerup', onUp);
    detach.addEventListener('pointercancel', onCancel);
  });
  return detach;
}

/**
 * Stable stand-in for a detached section so the panel layout does not jump: same section chrome,
 * one line of copy, and the keyboard-accessible restore path.
 */
export function createDetachedSectionPlaceholder(
  sectionId: DetachableSectionId,
  sectionTitle: string,
  dispatch: DetachDispatch,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__detached-placeholder';
  section.dataset['imageTrailDetachedPlaceholder'] = sectionId;

  const heading = document.createElement('h3');
  heading.textContent = sectionTitle;

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__meta';
  meta.textContent = `${sectionTitle} is open in a floating window.`;

  const restore = document.createElement('button');
  restore.type = 'button';
  restore.textContent = 'Restore to panel';
  restore.setAttribute('aria-label', `Restore ${sectionTitle} into the panel`);
  restore.addEventListener('click', () => dispatch({ name: 'section/restore', sectionId }));

  section.append(heading, meta, restore);
  return section;
}

export interface DetachedSectionWindowOptions {
  readonly sectionId: DetachableSectionId;
  readonly sectionTitle: string;
  readonly geometry: DetachedWindowGeometry;
  readonly animate?: boolean;
  /** Whether the window renders collapsed to its title bar. */
  readonly minimized?: boolean;
  /** Persist the window position after a drag; extension-owned, session-transient state. */
  readonly onPositionChange: (sectionId: DetachableSectionId, position: DetachedWindowPosition) => void;
  /** Persist the minimize toggle; extension-owned, session-transient state. */
  readonly onMinimizedChange: (sectionId: DetachableSectionId, minimized: boolean) => void;
}

/**
 * Floating extension-owned window hosting a detached section: `role=dialog`, drag-to-move via the
 * header, minimize collapses to the title bar, and close (X) or Escape restores the section to the
 * panel. The section content keeps dispatching its existing actions — the window is chrome only.
 */
export function createDetachedSectionWindow(
  options: DetachedSectionWindowOptions,
  content: HTMLElement,
  dispatch: DetachDispatch,
): HTMLElement {
  const { sectionId, sectionTitle, geometry } = options;
  const windowEl = document.createElement('aside');
  windowEl.className = 'image-trail-panel-root image-trail-panel__detached-window';
  if (options.animate) windowEl.classList.add('is-opening');
  windowEl.setAttribute('role', 'dialog');
  windowEl.setAttribute('aria-label', `${sectionTitle} (detached)`);
  windowEl.dataset['imageTrailDetachedWindow'] = sectionId;
  windowEl.style.left = `${geometry.left}px`;
  windowEl.style.top = `${geometry.top}px`;
  windowEl.style.width = `${geometry.inlineSize}px`;
  // Capture phase: section content stops keydown propagation on its row-action buttons
  // (history-view's item-actions span), which would swallow a bubble-phase Escape.
  windowEl.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      // Escape inside an editable control belongs to that control (cancel/blur an in-progress
      // edit), not to the window — dense sections like Settings carry text inputs and textareas.
      const origin = event.target;
      if (origin instanceof HTMLInputElement || origin instanceof HTMLTextAreaElement || origin instanceof HTMLSelectElement) return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({ name: 'section/restore', sectionId });
    },
    { capture: true },
  );

  const header = document.createElement('div');
  header.className = 'image-trail-panel__detached-header';

  const heading = document.createElement('h3');
  heading.className = 'image-trail-panel__detached-title';
  heading.textContent = sectionTitle;
  heading.addEventListener('pointerdown', (event) => startWindowDrag(event, windowEl, options));

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__detached-actions';

  const minimize = document.createElement('button');
  minimize.type = 'button';
  minimize.className = 'image-trail-panel__icon-button';
  minimize.textContent = '-';
  minimize.dataset['imageTrailMinimize'] = sectionId;
  const applyMinimized = (minimized: boolean): void => {
    windowEl.classList.toggle('is-minimized', minimized);
    minimize.setAttribute('aria-expanded', minimized ? 'false' : 'true');
    const label = minimized ? `Expand ${sectionTitle} window` : `Minimize ${sectionTitle} window`;
    minimize.setAttribute('aria-label', label);
    minimize.title = label;
  };
  applyMinimized(options.minimized === true);
  minimize.addEventListener('click', () => {
    const minimized = !windowEl.classList.contains('is-minimized');
    applyMinimized(minimized);
    options.onMinimizedChange(sectionId, minimized);
  });

  // Close semantics: the X restores the section into the panel — the window has no other exit.
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.className = 'image-trail-panel__icon-button';
  restore.textContent = 'X';
  restore.dataset['imageTrailRestore'] = sectionId;
  restore.setAttribute('aria-label', `Restore ${sectionTitle} into the panel`);
  restore.title = `Restore ${sectionTitle} into the panel`;
  restore.addEventListener('click', () => dispatch({ name: 'section/restore', sectionId }));

  actions.append(minimize, restore);
  header.append(heading, actions);

  const body = document.createElement('div');
  body.className = 'image-trail-panel__detached-body';
  body.append(content);

  windowEl.append(header, body);
  return windowEl;
}

function startWindowDrag(event: PointerEvent, windowEl: HTMLElement, options: DetachedSectionWindowOptions): void {
  if (event.button !== 0) return;
  event.preventDefault();
  const rect = windowEl.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  const heading = event.currentTarget;
  if (!(heading instanceof HTMLElement)) return;
  heading.setPointerCapture(event.pointerId);

  const positionFor = (move: PointerEvent): DetachedWindowPosition =>
    clampPanelPosition(
      { left: move.clientX - offsetX, top: move.clientY - offsetY },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    );

  const onMove = (move: PointerEvent): void => {
    const position = positionFor(move);
    windowEl.style.left = `${position.left}px`;
    windowEl.style.top = `${position.top}px`;
  };
  const onUp = (up: PointerEvent): void => {
    heading.releasePointerCapture(up.pointerId);
    heading.removeEventListener('pointermove', onMove);
    heading.removeEventListener('pointerup', onUp);
    heading.removeEventListener('pointercancel', onUp);
    options.onPositionChange(options.sectionId, positionFor(up));
  };
  heading.addEventListener('pointermove', onMove);
  heading.addEventListener('pointerup', onUp);
  heading.addEventListener('pointercancel', onUp);
}
