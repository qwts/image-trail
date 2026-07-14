import type { Slideshow } from '../../core/automation/slideshow.js';
import type { CaptureResult } from '../../core/image/capture-result.js';
import type { PanelAction, PanelState } from '../../core/types.js';
import { captureCurrentImageWithFeedback, pinCurrentImageWithFeedback, type CurrentImageFeedbackTone } from './current-image-workflows.js';

export interface ShortcutActionDeps {
  getState(): PanelState;
  dispatch(action: PanelAction): void;
  slideshow(): Pick<Slideshow, 'currentPhase'>;
  toggleBufferedNavDebug(): void;
  bookmarkCurrentImage(): Promise<boolean>;
  captureImage(url: string): Promise<CaptureResult | null>;
  downloadCurrentImage(saveAs: boolean): Promise<boolean>;
  showFeedback(message: string, tone?: CurrentImageFeedbackTone): void;
}

/** Maps canonical in-page and browser-command ids to panel workflows. */
export function handlePanelShortcutAction(action: string, deps: ShortcutActionDeps): boolean {
  if (action === 'down-arrow' && deps.getState().downArrowAction === 'off') return false;
  const handlers: Record<string, () => void | Promise<void>> = {
    next: () => deps.dispatch({ name: 'navigate-next' }),
    previous: () => deps.dispatch({ name: 'navigate-previous' }),
    'capture-current': () => captureCurrentImageWithFeedback(deps),
    'capture-and-bookmark': () => captureCurrentImageWithFeedback(deps),
    'pin-current': () => pinCurrentImageWithFeedback(deps),
    'down-arrow': () => runDownArrowAction(deps),
    'help-toggle': () => deps.dispatch({ name: 'help/toggle' }),
    'settings-toggle': () => deps.dispatch({ name: 'settings/toggle' }),
    'close-surface': () => closeActiveSurface(deps),
    'slideshow-toggle': () => deps.dispatch({ name: shortcutSlideshowAction(deps.slideshow()) }),
    'buffer-debug-toggle': () => deps.toggleBufferedNavDebug(),
    stop: () => deps.dispatch({ name: 'stop-all' }),
    'panel-toggle': () => deps.dispatch({ name: 'toggle-panel' }),
    'grab-mode-toggle': () => deps.dispatch({ name: deps.getState().target.grabModeActive ? 'grab-mode/stop' : 'grab-mode/start' }),
    retry: () => deps.dispatch({ name: 'retry-start' }),
    download: () => downloadCurrentImage(deps, false),
    'download-save-as': () => downloadCurrentImage(deps, true),
  };
  const handler = handlers[action];
  if (!handler) return false;
  void handler();
  return true;
}

function runDownArrowAction(deps: ShortcutActionDeps): Promise<void> {
  return deps.getState().downArrowAction === 'download' ? downloadCurrentImage(deps, false) : captureCurrentImageWithFeedback(deps);
}

async function downloadCurrentImage(deps: ShortcutActionDeps, saveAs: boolean): Promise<void> {
  const state = deps.getState();
  if (state.importExportBusy) {
    deps.showFeedback('An image export is already running.', 'warning');
    return;
  }
  if (!state.target.selectedUrl) {
    deps.showFeedback('Select an image first.', 'warning');
    return;
  }
  deps.showFeedback(saveAs ? 'Preparing Save As…' : 'Downloading current image…');
  if (!(await deps.downloadCurrentImage(saveAs))) deps.showFeedback('Could not download the current image.', 'error');
}

function closeActiveSurface(deps: ShortcutActionDeps): void {
  const state = deps.getState();
  if (state.helpOpen) {
    deps.dispatch({ name: 'help/toggle' });
  } else if (state.activeDestination) {
    deps.dispatch({ name: 'destination/close' });
  } else {
    deps.dispatch({ name: 'close-panel' });
  }
}

function shortcutSlideshowAction(slideshow: Pick<Slideshow, 'currentPhase'>): 'slideshow-pause' | 'slideshow-resume' | 'slideshow-start' {
  if (slideshow.currentPhase === 'running') return 'slideshow-pause';
  if (slideshow.currentPhase === 'paused') return 'slideshow-resume';
  return 'slideshow-start';
}
