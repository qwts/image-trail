import type { ActionEntries } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type TargetActionName =
  | 'start-target-picker'
  | 'stop-target-picker'
  | 'grab-mode/start'
  | 'grab-mode/stop'
  | 'target/release'
  | 'target/fill-screen'
  | 'target/set-object-fit'
  | 'page-context/set';

/** Target picking, grab mode, and selected-target presentation. Bodies moved verbatim from the panel dispatch chain. */
export function buildTargetActionEntries(deps: PanelActionDeps): ActionEntries<TargetActionName> {
  return {
    'start-target-picker': {
      handle(action) {
        deps.reduce(action);
        deps.pageAdapter().startPickMode();
      },
    },
    'stop-target-picker': {
      handle(action) {
        deps.reduce(action);
        deps.pageAdapter().stopPickMode();
      },
    },
    'grab-mode/start': {
      handle(action) {
        deps.reduce(action);
        deps.syncTargetState(deps.pageAdapter().startGrabMode());
        deps.render();
      },
    },
    'grab-mode/stop': {
      handle(action) {
        deps.reduce(action);
        deps.syncTargetState(deps.pageAdapter().stopGrabMode());
        deps.render();
      },
    },
    'target/release': {
      handle() {
        const snapshot = deps.pageAdapter().releaseSelectedTarget();
        deps.syncTargetState(snapshot);
        deps.render();
      },
    },
    'target/fill-screen': {
      handle(action) {
        const snapshot = deps.pageAdapter().setSelectedFillScreen(action.enabled);
        deps.syncTargetState(snapshot);
        deps.saveLocalSettings({ ...deps.getLocalSettings(), previewFillScreen: snapshot.fillScreen });
        deps.render();
      },
    },
    'target/set-object-fit': {
      handle(action) {
        const snapshot = deps.pageAdapter().setSelectedObjectFit(action.mode);
        deps.syncTargetState(snapshot);
        deps.saveLocalSettings({ ...deps.getLocalSettings(), previewObjectFit: snapshot.objectFit });
        deps.render();
      },
    },
    'page-context/set': {
      handle(action) {
        deps.updatePageContextOverride(action.context);
      },
    },
  };
}
