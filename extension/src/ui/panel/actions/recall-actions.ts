import type { ActionEntries, AnyActionDef } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type RecallActionName =
  | 'recall/delete-all'
  | 'recall/open'
  | 'recall/close'
  | 'recall-selection/toggle'
  | 'recall-selection/select'
  | 'recall-selection/clear'
  | 'recall/clear-results'
  | 'recall/load-more'
  | 'recall/selected';

/** Recall drawer lifecycle and recall-row selection. Bodies moved verbatim from the panel dispatch chain. */
export function buildRecallActionEntries(deps: PanelActionDeps): ActionEntries<RecallActionName> {
  const reduceAndRender: AnyActionDef = {
    handle(action) {
      deps.reduce(action);
      deps.render();
    },
  };
  return {
    'recall/delete-all': {
      handle() {
        void deps.deleteRecallBookmarks();
      },
    },
    'recall/open': {
      handle() {
        if (deps.getState().recall.open) {
          // Re-opening an open drawer toggles it shut: reduce a synthesized close, NOT the
          // dispatched open action (which carries the drawer side).
          deps.clearRecallMessageTimer();
          deps.reduce({ name: 'recall/close' });
          deps.render();
          return;
        }
        void deps.openRecallDrawer();
      },
    },
    'recall/close': {
      handle(action) {
        deps.clearRecallMessageTimer();
        deps.reduce(action);
        deps.render();
      },
    },
    'recall-selection/toggle': reduceAndRender,
    'recall-selection/select': reduceAndRender,
    'recall-selection/clear': reduceAndRender,
    'recall/clear-results': reduceAndRender,
    'recall/load-more': {
      handle() {
        const { recall } = deps.getState();
        if (!recall.busy && recall.hasMore) {
          void deps.loadRecallCandidates({ offset: recall.nextOffset, append: true });
        }
      },
    },
    'recall/selected': {
      handle() {
        void deps.recallSelectedRecords();
      },
    },
  };
}
