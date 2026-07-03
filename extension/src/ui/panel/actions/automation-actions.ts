import type { ActionEntries } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type AutomationActionName =
  | 'slideshow-start'
  | 'slideshow-stop'
  | 'slideshow-pause'
  | 'slideshow-resume'
  | 'retry-start'
  | 'retry-stop'
  | 'stop-all'
  | 'navigate-next'
  | 'navigate-previous';

/** Slideshow/retry automation and manual navigation. Bodies moved verbatim from the panel dispatch chain. */
export function buildAutomationActionEntries(deps: PanelActionDeps): ActionEntries<AutomationActionName> {
  return {
    'slideshow-start': {
      handle(action) {
        deps.reduce(action);
        deps.slideshow().start();
        deps.render();
      },
    },
    'slideshow-stop': {
      handle(action) {
        deps.reduce(action);
        deps.slideshow().stop();
        deps.render();
      },
    },
    'slideshow-pause': {
      handle(action) {
        deps.reduce(action);
        deps.slideshow().pause();
        deps.render();
      },
    },
    'slideshow-resume': {
      handle(action) {
        deps.reduce(action);
        deps.slideshow().resume();
        deps.render();
      },
    },
    'retry-start': {
      handle(action) {
        deps.reduce(action);
        deps.retry().start();
        deps.render();
      },
    },
    'retry-stop': {
      handle(action) {
        deps.reduce(action);
        deps.retry().stop();
        deps.render();
      },
    },
    'stop-all': {
      // Unlike the individual slideshow/retry actions, the collaborators stop BEFORE the reduce:
      // their phase callbacks synchronously reduce + render, and the chain relied on that order.
      handle(action) {
        deps.slideshow().stop();
        deps.retry().stop();
        deps.reduce(action);
        deps.render();
      },
    },
    'navigate-next': {
      handle() {
        deps.navigateBy(1);
      },
    },
    'navigate-previous': {
      handle() {
        deps.navigateBy(-1);
      },
    },
  };
}
