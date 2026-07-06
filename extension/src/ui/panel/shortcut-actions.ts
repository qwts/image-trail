import type { Slideshow } from '../../core/automation/slideshow.js';
import type { PanelAction, PanelState } from '../../core/types.js';

export interface ShortcutActionDeps {
  getState(): PanelState;
  dispatch(action: PanelAction): void;
  slideshow(): Pick<Slideshow, 'currentPhase'>;
  toggleBufferedNavDebug(): void;
}

/** Maps assignable keyboard-shortcut command ids to panel actions, moved verbatim off `ImageTrailPanel`. */
export function handlePanelShortcutAction(action: string, deps: ShortcutActionDeps): void {
  const handlers: Record<string, () => void> = {
    next: () => deps.dispatch({ name: 'navigate-next' }),
    previous: () => deps.dispatch({ name: 'navigate-previous' }),
    'slideshow-toggle': () => deps.dispatch({ name: shortcutSlideshowAction(deps.slideshow()) }),
    'buffer-debug-toggle': () => deps.toggleBufferedNavDebug(),
    stop: () => deps.dispatch({ name: 'stop-all' }),
    'panel-toggle': () => deps.dispatch({ name: 'toggle-panel' }),
    'grab-mode-toggle': () => deps.dispatch({ name: deps.getState().target.grabModeActive ? 'grab-mode/stop' : 'grab-mode/start' }),
    retry: () => deps.dispatch({ name: 'retry-start' }),
    download: () => {
      if (!deps.getState().importExportBusy) deps.dispatch({ name: 'export/image', saveAs: false });
    },
    'download-save-as': () => {
      if (!deps.getState().importExportBusy) deps.dispatch({ name: 'export/image', saveAs: true });
    },
  };
  handlers[action]?.();
}

function shortcutSlideshowAction(slideshow: Pick<Slideshow, 'currentPhase'>): 'slideshow-pause' | 'slideshow-resume' | 'slideshow-start' {
  if (slideshow.currentPhase === 'running') return 'slideshow-pause';
  if (slideshow.currentPhase === 'paused') return 'slideshow-resume';
  return 'slideshow-start';
}
