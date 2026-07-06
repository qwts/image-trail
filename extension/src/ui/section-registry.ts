import type { DetachableSectionId, PanelState } from '../core/types.js';
import {
  attachSectionDragOut,
  createDetachedSectionPlaceholder,
  createSectionDetachControl,
  DEFAULT_DETACHED_WINDOW_INLINE_SIZE,
} from './components/detachable-section.js';
import type { PanelRenderTarget } from './render.js';

/**
 * One declarative entry per panel section (issue #408). The registry is the single source of
 * detachability: the attached panel composition, the detach control, the section-surface drag-out,
 * the placeholder, and the floating window all derive from it — adding a section to the panel makes
 * it detachable with no further wiring.
 */
export interface DetachableSectionDefinition {
  readonly id: DetachableSectionId;
  readonly title: string;
  /** Floating-window width; defaults to the shared 340px. */
  readonly windowInlineSize?: number;
  /** When false, neither the section, its placeholder, nor its window renders this pass. */
  readonly visible?: (state: PanelState) => boolean;
  readonly create: (target: PanelRenderTarget, state: PanelState) => HTMLElement;
}

export function sectionWindowInlineSize(definition: DetachableSectionDefinition): number {
  return definition.windowInlineSize ?? DEFAULT_DETACHED_WINDOW_INLINE_SIZE;
}

export function sectionVisible(definition: DetachableSectionDefinition, state: PanelState): boolean {
  return definition.visible?.(state) ?? true;
}

/**
 * The attached-panel elements for the registry, in registry order: each visible section renders
 * either in place (wired with its detach control and surface drag-out) or as its placeholder while
 * detached.
 */
export function attachedSectionElements(
  definitions: readonly DetachableSectionDefinition[],
  target: PanelRenderTarget,
  state: PanelState,
): HTMLElement[] {
  return definitions
    .filter((definition) => sectionVisible(definition, state))
    .map((definition) =>
      state.detachedSections.includes(definition.id)
        ? createDetachedSectionPlaceholder(definition.id, definition.title, target.dispatch)
        : detachableSectionElement(definition, target, state),
    );
}

function detachableSectionElement(definition: DetachableSectionDefinition, target: PanelRenderTarget, state: PanelState): HTMLElement {
  const element = definition.create(target, state);
  const onDragOutPosition = (id: DetachableSectionId, position: { readonly left: number; readonly top: number }): void => {
    target.layoutState.detachedWindowPositions.set(id, position);
  };
  const dragOptions = {
    sectionId: definition.id,
    windowInlineSize: sectionWindowInlineSize(definition),
    dispatch: target.dispatch,
    onDragOutPosition,
  };
  injectDetachControl(
    element,
    createSectionDetachControl(definition.id, definition.title, target.dispatch, {
      windowInlineSize: dragOptions.windowInlineSize,
      onDragOutPosition,
    }),
  );
  attachSectionDragOut(element, dragOptions);
  return element;
}

/**
 * Places the ⧉ control inside whatever heading structure the section already has — a
 * `section-header` row, an `h3` inside a `<details>` summary, or a bare `h3` (which gets wrapped)
 * — so individual views need no knowledge of detachment.
 */
function injectDetachControl(sectionEl: HTMLElement, control: HTMLElement): void {
  const headerRow = sectionEl.querySelector<HTMLElement>(':scope > .image-trail-panel__section-header');
  if (headerRow) {
    headerRow.append(control);
    return;
  }
  const heading = sectionEl.querySelector<HTMLElement>('h3');
  if (!heading || !heading.parentElement) {
    sectionEl.prepend(control);
    return;
  }
  if (heading.parentElement.tagName === 'SUMMARY') {
    heading.parentElement.classList.add('image-trail-panel__summary-has-detach-control');
    heading.parentElement.style.setProperty('--image-trail-summary-tail-margin', '8px');
    heading.parentElement.append(control);
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__section-header';
  heading.replaceWith(wrapper);
  wrapper.append(heading, control);
}
