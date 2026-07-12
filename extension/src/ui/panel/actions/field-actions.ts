import { reducePanelAction } from '../../../core/actions.js';
import type { ActionEntries } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type FieldActionName =
  | 'field/transform'
  | 'field/commit-rejected'
  | 'active-field/set'
  | 'field-unlock/toggle'
  | 'selected-url/apply'
  | 'selected-url/reject-unsupported-input'
  | 'url-template/remove'
  | 'url-template/update-settings'
  | 'url-template/update-fields'
  | 'grab-source-pattern/update-settings'
  | 'grab-source-pattern/remove';

/** Parsed URL fields, the URL editor, and template/grab-pattern settings. Bodies moved verbatim from the panel dispatch chain. */
export function buildFieldActionEntries(deps: PanelActionDeps): ActionEntries<FieldActionName> {
  return {
    'field/transform': {
      handle(action) {
        deps.enqueueFieldTransform(action);
      },
    },
    'field/commit-rejected': {
      handle() {
        deps.enqueueRejectedFieldCommit();
      },
    },
    'active-field/set': {
      handle(action) {
        deps.applyPanelState(reducePanelAction(deps.getState(), action), { saveParsedFieldState: true, render: true });
      },
    },
    'field-unlock/toggle': {
      handle(action) {
        const updated = deps.applyPanelState(reducePanelAction(deps.getState(), action), { saveParsedFieldState: true });
        if (!updated) return;
        void deps
          .urlTemplateSettings()
          .saveUrlTemplateFromCurrentFields()
          .then(() => {
            deps.bufferedNav().prime();
            deps.render();
          });
      },
    },
    'selected-url/apply': {
      handle(action) {
        deps.enqueueSelectedUrlApply(action.url);
      },
    },
    'selected-url/reject-unsupported-input': {
      handle() {
        deps.rejectUrlEditorInput();
      },
    },
    'url-template/remove': {
      handle(action) {
        void deps.urlTemplateSettings().removeUrlTemplate(action.id);
      },
    },
    'url-template/update-settings': {
      handle(action) {
        void deps.urlTemplateSettings().updateUrlTemplateSettings(action.id, action);
      },
    },
    'url-template/update-fields': {
      handle(action) {
        void deps.urlTemplateSettings().updateUrlTemplateFields(action.id, action);
      },
    },
    'grab-source-pattern/update-settings': {
      handle(action) {
        void deps.urlTemplateSettings().updateGrabSourcePattern(action.id, action);
      },
    },
    'grab-source-pattern/remove': {
      handle(action) {
        void deps.urlTemplateSettings().removeGrabSourcePattern(action.id);
      },
    },
  };
}
