import type { DetachableSectionId, PanelState } from '../core/types.js';
import { floatingSection } from '../core/workspace-layout.js';
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
  /** Optional attached-panel filter; detached windows continue to use `visible`. */
  readonly attachedVisible?: (state: PanelState) => boolean;
  /** A section may keep drag-out without showing a dedicated detach icon. */
  readonly showDetachControl?: boolean;
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
    .filter((definition) => sectionVisible(definition, state) && (definition.attachedVisible?.(state) ?? true))
    .map((definition) =>
      state.detachedSections.includes(definition.id)
        ? createDetachedSectionPlaceholder(definition.id, definition.title, target.dispatch)
        : detachableSectionElement(definition, target, state),
    );
}

function detachableSectionElement(definition: DetachableSectionDefinition, target: PanelRenderTarget, state: PanelState): HTMLElement {
  const element = definition.create(target, state);
  const onDragOutPosition = (id: DetachableSectionId, position: { readonly left: number; readonly top: number }): void => {
    target.layoutState.workspaceSections.set(
      id,
      floatingSection(id, {
        ...position,
        width: sectionWindowInlineSize(definition),
        height: 320,
      }),
    );
  };
  const dragOptions = {
    sectionId: definition.id,
    windowInlineSize: sectionWindowInlineSize(definition),
    dispatch: target.dispatch,
    onDragOutPosition,
  };
  if (definition.showDetachControl !== false) {
    injectDetachControl(
      element,
      createSectionDetachControl(definition.id, definition.title, target.dispatch, {
        windowInlineSize: dragOptions.windowInlineSize,
        onDragOutPosition,
      }),
    );
  }
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
    headerRow.classList.add('image-trail-ds__section-header');
    headerRow.querySelector<HTMLElement>('h2, h3, h4')?.classList.add('image-trail-ds__section-title');
    headerRow.append(control);
    return;
  }
  const heading = sectionEl.querySelector<HTMLElement>('h3');
  if (!heading || !heading.parentElement) {
    sectionEl.prepend(control);
    return;
  }
  if (heading.parentElement.tagName === 'SUMMARY') {
    heading.classList.add('image-trail-ds__section-title');
    heading.parentElement.classList.add('image-trail-ds__section-header');
    heading.parentElement.append(control);
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__section-header image-trail-ds__section-header';
  heading.classList.add('image-trail-ds__section-title');
  heading.replaceWith(wrapper);
  wrapper.append(heading, control);
}
