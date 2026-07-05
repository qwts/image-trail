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

/**
 * Keyboard-accessible detach control rendered inside a section's own header. The floating window is
 * extension-owned; this only dispatches — window creation happens on the detached render pass.
 */
export function createSectionDetachControl(sectionId: DetachableSectionId, sectionTitle: string, dispatch: DetachDispatch): HTMLElement {
  const detach = document.createElement('button');
  detach.type = 'button';
  detach.className = 'image-trail-panel__icon-button image-trail-panel__section-detach';
  detach.textContent = '⧉';
  detach.dataset['imageTrailDetach'] = sectionId;
  detach.setAttribute('aria-label', `Detach ${sectionTitle} into a floating window`);
  detach.title = `Detach ${sectionTitle} into a floating window`;
  detach.addEventListener('click', () => dispatch({ name: 'section/detach', sectionId }));
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
  /** Persist the window position after a drag; extension-owned, session-transient state. */
  readonly onPositionChange: (sectionId: DetachableSectionId, position: DetachedWindowPosition) => void;
}

/**
 * Floating extension-owned window hosting a detached section: `role=dialog`, drag-to-move via the
 * header, Escape restores the section to the panel. The section content keeps dispatching its
 * existing actions — the window is chrome only.
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

  const restore = document.createElement('button');
  restore.type = 'button';
  restore.textContent = 'Restore';
  restore.dataset['imageTrailRestore'] = sectionId;
  restore.setAttribute('aria-label', `Restore ${sectionTitle} into the panel`);
  restore.title = `Restore ${sectionTitle} into the panel`;
  restore.addEventListener('click', () => dispatch({ name: 'section/restore', sectionId }));

  header.append(heading, restore);

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
