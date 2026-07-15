import type { ActionEntries } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type DetachableSectionActionName =
  | 'section/detach'
  | 'section/restore'
  | 'workspace/move'
  | 'workspace/resize'
  | 'workspace/snap'
  | 'workspace/unsnap'
  | 'workspace/shade'
  | 'workspace/reorder';

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
        deps.prepareDetachedWorkspaceSection(action.sectionId, action.floatingRect);
        deps.reduce(action);
        deps.render();
        deps.notifyWorkspaceLayoutChanged();
        focusControl(deps.panelMount().detachedRoot, `[data-image-trail-restore="${action.sectionId}"]`);
      },
    },
    'section/restore': {
      handle(action) {
        deps.restoreWorkspaceSection(action.sectionId);
        deps.reduce(action);
        deps.render();
        deps.notifyWorkspaceLayoutChanged();
        focusControl(deps.panelMount().root, `[data-image-trail-detach="${action.sectionId}"]`);
      },
    },
    'workspace/move': {
      handle(action) {
        deps.moveWorkspaceSection(action.sectionId, action.floatingRect);
      },
    },
    'workspace/resize': {
      handle(action) {
        deps.resizeWorkspaceSection(action.sectionId, action.floatingRect);
      },
    },
    'workspace/unsnap': {
      handle(action) {
        deps.moveWorkspaceSection(action.sectionId, action.floatingRect);
        focusControl(
          deps.panelMount().detachedRoot,
          `[data-image-trail-detached-window="${action.sectionId}"][data-workspace-mode="floating"] .image-trail-workspace__window-header`,
        );
      },
    },
    'workspace/snap': {
      handle(action) {
        deps.snapWorkspaceSection(action.sectionId, action.edge);
        focusControl(deps.panelMount().detachedRoot, `[data-image-trail-unsnap="${action.sectionId}"]`);
      },
    },
    'workspace/shade': {
      handle(action) {
        deps.shadeWorkspaceSection(action.sectionId);
      },
    },
    'workspace/reorder': {
      handle(action) {
        deps.reorderWorkspaceSection(action.sectionId, action.edge, action.order);
      },
    },
  };
}
