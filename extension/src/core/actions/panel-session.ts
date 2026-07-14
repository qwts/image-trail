import { closePanel, EMPTY_AUTOMATION_STATE, showPanel } from '../state.js';
import type { PanelState } from '../types.js';
import { assertNeverAction } from './routing.js';
import type { PanelActionForDomain } from './routing.js';
import { resolvePageContextState } from '../page-context.js';

type PanelSessionAction = PanelActionForDomain<'panel-session'>;

export function reducePanelSessionAction(state: PanelState, action: PanelSessionAction): PanelState {
  switch (action.name) {
    case 'toggle-panel':
      return state.visible ? closePanel(state) : showPanel(state);
    case 'close-panel':
      return closePanel(state);
    case 'panel/minimize':
      return { ...state, visible: true, minimized: true, lastUpdatedAt: Date.now() };
    case 'panel/expand':
      return { ...state, visible: true, minimized: false, lastUpdatedAt: Date.now() };
    case 'panel/secondary-controls-open':
      if (state.secondaryControlsOpen === action.open) return state;
      return { ...state, secondaryControlsOpen: action.open, lastUpdatedAt: Date.now() };
    case 'panel/history-section-open':
      return { ...state, historySectionOpen: action.open, lastUpdatedAt: Date.now() };
    case 'panel/bookmarks-section-open':
      return { ...state, bookmarksSectionOpen: action.open, lastUpdatedAt: Date.now() };
    case 'start-target-picker':
      return { ...state, status: 'picking', message: 'Pick mode is active. Click the intended image.', lastUpdatedAt: Date.now() };
    case 'stop-target-picker':
      return { ...state, status: 'ready', message: state.target.message, lastUpdatedAt: Date.now() };
    case 'grab-mode/start':
      return {
        ...state,
        status: 'ready',
        message: 'Grab Mode is active. Click page images to add them to the queue.',
        lastUpdatedAt: Date.now(),
      };
    case 'grab-mode/stop':
      return { ...state, status: 'ready', message: 'Grab Mode stopped.', lastUpdatedAt: Date.now() };
    case 'help/toggle':
      return {
        ...state,
        helpOpen: !state.helpOpen,
        settingsOpen: state.helpOpen ? state.settingsOpen : false,
        lastUpdatedAt: Date.now(),
      };
    case 'page-context/set':
      return {
        ...state,
        pageContext: resolvePageContextState(state.pageContext, action.context),
        lastUpdatedAt: Date.now(),
      };
    case 'section/detach':
      if (state.detachedSections.includes(action.sectionId)) return state;
      return { ...state, detachedSections: [...state.detachedSections, action.sectionId], lastUpdatedAt: Date.now() };
    case 'section/restore':
      if (!state.detachedSections.includes(action.sectionId)) return state;
      return {
        ...state,
        detachedSections: state.detachedSections.filter((sectionId) => sectionId !== action.sectionId),
        lastUpdatedAt: Date.now(),
      };
    case 'slideshow-start':
      return { ...state, automation: { ...state.automation, slideshowPhase: 'running', slideshowCount: 0 }, lastUpdatedAt: Date.now() };
    case 'slideshow-stop':
      return { ...state, automation: { ...state.automation, slideshowPhase: 'stopped' }, lastUpdatedAt: Date.now() };
    case 'slideshow-pause':
      return { ...state, automation: { ...state.automation, slideshowPhase: 'paused' }, lastUpdatedAt: Date.now() };
    case 'slideshow-resume':
      return { ...state, automation: { ...state.automation, slideshowPhase: 'running' }, lastUpdatedAt: Date.now() };
    case 'retry-start':
      return { ...state, automation: { ...state.automation, retryPhase: 'running', retriesUsed: 0 }, lastUpdatedAt: Date.now() };
    case 'retry-stop':
      return { ...state, automation: { ...state.automation, retryPhase: 'stopped' }, lastUpdatedAt: Date.now() };
    case 'stop-all':
      return { ...state, automation: { ...EMPTY_AUTOMATION_STATE }, lastUpdatedAt: Date.now() };
    case 'target/fill-screen':
    case 'target/set-object-fit':
    case 'target/release':
    case 'undo-last':
    case 'navigate-next':
    case 'navigate-previous':
      return state;
    default:
      return assertNeverAction(action);
  }
}
