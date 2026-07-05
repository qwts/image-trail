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
export const DEFAULT_DETACHED_WINDOW_INLINE_SIZE = 340;

export interface DragOutOptions {
  readonly sectionId: DetachableSectionId;
  /** The section's floating-window width — the ghost renders and clamps at this size. */
  readonly windowInlineSize: number;
  readonly dispatch: DetachDispatch;
  readonly onDragOutPosition: (sectionId: DetachableSectionId, position: DetachedWindowPosition) => void;
  /** Called when a drag actually engaged and ended (dropped or cancelled) — e.g. to swallow the trailing click. */
  readonly onDragEnd?: (committed: boolean) => void;
}

/**
 * Shared drag-out engine used by the ⧉ control and by section surfaces: past a small pointer
 * distance a drop ghost appears; releasing seeds the window position and dispatches
 * `section/detach`; Escape (or pointercancel) cancels the drag and dispatches nothing.
 */
export function beginDragOut(event: PointerEvent, handle: HTMLElement, options: DragOutOptions): void {
  if (event.button !== 0) return;
  // Capture immediately: once the pointer leaves the handle, move/up events would otherwise
  // target whatever is under the cursor and the drag would never engage.
  if (typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  const startY = event.clientY;
  let ghost: HTMLElement | null = null;

  const dropPosition = (move: PointerEvent): DetachedWindowPosition =>
    clampPanelPosition(
      { left: move.clientX - 24, top: move.clientY - 12 },
      { width: options.windowInlineSize, height: DRAG_GHOST_BLOCK_SIZE },
      { width: window.innerWidth, height: window.innerHeight },
    );
  const onMove = (move: PointerEvent): void => {
    if (!ghost) {
      if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_OUT_THRESHOLD_PX) return;
      ghost = document.createElement('div');
      ghost.className = 'image-trail-panel__detach-ghost';
      ghost.style.width = `${options.windowInlineSize}px`;
      ghost.style.height = `${DRAG_GHOST_BLOCK_SIZE}px`;
      const rootNode = handle.getRootNode();
      (rootNode instanceof ShadowRoot ? rootNode : document.body).append(ghost);
      // A drag started from a section surface would otherwise smear a text selection around.
      document.getSelection()?.removeAllRanges();
      handle.style.userSelect = 'none';
    }
    const position = dropPosition(move);
    ghost.style.left = `${position.left}px`;
    ghost.style.top = `${position.top}px`;
  };
  const cleanup = (): void => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onAbort);
    window.removeEventListener('keydown', onKeyDown, true);
    if (typeof handle.releasePointerCapture === 'function') handle.releasePointerCapture(event.pointerId);
    handle.style.userSelect = '';
    ghost?.remove();
  };
  const onUp = (up: PointerEvent): void => {
    const dragged = ghost !== null;
    cleanup();
    if (!dragged) return;
    options.onDragEnd?.(true);
    options.onDragOutPosition(options.sectionId, dropPosition(up));
    options.dispatch({ name: 'section/detach', sectionId: options.sectionId });
  };
  const onAbort = (): void => {
    const dragged = ghost !== null;
    cleanup();
    if (dragged) options.onDragEnd?.(false);
  };
  const onKeyDown = (key: KeyboardEvent): void => {
    if (key.key !== 'Escape') return;
    key.preventDefault();
    key.stopPropagation();
    onAbort();
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onAbort);
  window.addEventListener('keydown', onKeyDown, true);
}

/**
 * Makes a whole section surface a drag-out source: pressing any non-interactive part of the
 * section (not buttons, form controls, summaries, list rows, or resizable lists) and dragging past
 * the threshold detaches it at the drop point. Sub-threshold presses stay inert, so ordinary
 * clicks never detach.
 */
const INTERACTIVE_DRAG_ORIGIN =
  'button, input, select, textarea, summary, a, [role="button"], [contenteditable="true"], li, ol, img, .image-trail-panel__field-list';

export function attachSectionDragOut(sectionEl: HTMLElement, options: DragOutOptions): void {
  sectionEl.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const origin = event.target;
    if (origin instanceof Element && origin.closest(INTERACTIVE_DRAG_ORIGIN)) return;
    beginDragOut(event, sectionEl, options);
  });
}

/**
 * Keyboard-accessible detach control rendered inside a section's own header. Click (or Enter/Space)
 * detaches at the default position; press-and-drag runs the shared drag-out engine. The floating
 * window is extension-owned; this only dispatches — window creation happens on the detached render
 * pass.
 */
export function createSectionDetachControl(
  sectionId: DetachableSectionId,
  sectionTitle: string,
  dispatch: DetachDispatch,
  options: {
    readonly windowInlineSize?: number;
    readonly onDragOutPosition?: (sectionId: DetachableSectionId, position: DetachedWindowPosition) => void;
  } = {},
): HTMLElement {
  const detach = document.createElement('button');
  detach.type = 'button';
  detach.className = 'image-trail-panel__icon-button image-trail-panel__section-detach';
  detach.textContent = '⧉';
  detach.dataset['imageTrailDetach'] = sectionId;
  detach.setAttribute('aria-label', `Detach ${sectionTitle} into a floating window (drag to place)`);
  detach.title = `Detach ${sectionTitle} into a floating window (drag to place)`;
  let suppressClick = false;
  detach.addEventListener('click', (event) => {
    // The control may live inside a <details> summary (Host target, Parsed fields, Manual
    // controls) — activating it must not toggle the group.
    event.preventDefault();
    event.stopPropagation();
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    dispatch({ name: 'section/detach', sectionId });
  });
  const onDragOutPosition = options.onDragOutPosition;
  if (onDragOutPosition) {
    detach.addEventListener('pointerdown', (event) => {
      beginDragOut(event, detach, {
        sectionId,
        windowInlineSize: options.windowInlineSize ?? DEFAULT_DETACHED_WINDOW_INLINE_SIZE,
        dispatch,
        onDragOutPosition,
        onDragEnd: () => {
          suppressClick = true;
        },
      });
    });
  }
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
  const originalLeft = windowEl.style.left;
  const originalTop = windowEl.style.top;
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
  const cleanup = (): void => {
    heading.removeEventListener('pointermove', onMove);
    heading.removeEventListener('pointerup', onUp);
    heading.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKeyDown, true);
    if (typeof heading.releasePointerCapture === 'function') heading.releasePointerCapture(event.pointerId);
  };
  const onUp = (up: PointerEvent): void => {
    cleanup();
    options.onPositionChange(options.sectionId, positionFor(up));
  };
  // Escape (or pointercancel) reverts the window to where the drag started.
  const onCancel = (): void => {
    cleanup();
    windowEl.style.left = originalLeft;
    windowEl.style.top = originalTop;
  };
  const onKeyDown = (key: KeyboardEvent): void => {
    if (key.key !== 'Escape') return;
    key.preventDefault();
    key.stopPropagation();
    onCancel();
  };
  heading.addEventListener('pointermove', onMove);
  heading.addEventListener('pointerup', onUp);
  heading.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKeyDown, true);
}
