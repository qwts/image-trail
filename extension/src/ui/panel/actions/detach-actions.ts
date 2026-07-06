import type { ActionEntries } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type DetachableSectionActionName = 'section/detach' | 'section/restore';

/**
 * Detachable-section lifecycle (issue #215): reduce, rerender, then hand keyboard focus across the
 * panel/window roots — to the floating window's restore control after a detach, and back to the
 * section's detach control after a restore. Focus moves in a microtask so it lands after the
 * render's own focus-restore pass.
 */
export function buildDetachableSectionActionEntries(deps: PanelActionDeps): ActionEntries<DetachableSectionActionName> {
  const focusControl = (root: HTMLElement | null, selector: string): void => {
    queueMicrotask(() => {
      root?.querySelector<HTMLElement>(selector)?.focus();
    });
  };
  return {
    'section/detach': {
      handle(action) {
        deps.reduce(action);
        deps.render();
        deps.notifyWorkspaceLayoutChanged();
        focusControl(deps.panelMount().detachedRoot, `[data-image-trail-restore="${action.sectionId}"]`);
      },
    },
    'section/restore': {
      handle(action) {
        deps.reduce(action);
        deps.render();
        deps.notifyWorkspaceLayoutChanged();
        focusControl(deps.panelMount().root, `[data-image-trail-detach="${action.sectionId}"]`);
      },
    },
  };
}
