import type { PanelAction, PanelState } from '../core/types.js';
import { createBookmarksView } from './components/bookmarks-view.js';
import { createControlsView } from './components/controls-view.js';
import { createFieldsView } from './components/fields-view.js';
import { createUrlEditorView } from './components/url-editor-view.js';
import { createHistoryView } from './components/history-view.js';
import { createStatusView } from './components/status-view.js';
import { createTargetPickerView } from './components/target-picker-view.js';
import { parseUrl } from '../core/url/parse-url.js';
import { collectUrlFields } from '../core/url/tokenize-fields.js';

export interface PanelRenderTarget {
  readonly root: HTMLElement;
  readonly dispatch: (action: PanelAction) => void;
}

function makeButton(label: string, action: PanelAction, dispatch: (action: PanelAction) => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', () => dispatch(action));
  return button;
}

export function renderPanel(target: PanelRenderTarget, state: PanelState): void {
  target.root.replaceChildren();

  const fields = (() => {
    if (!state.target.selectedUrl) return [];
    try {
      return collectUrlFields(parseUrl(state.target.selectedUrl));
    } catch {
      return [];
    }
  })();

  const dispatchActiveField = (delta: -1 | 1): void => {
    if (fields.length === 0) return;
    const currentIndex = fields.findIndex((field) => field.id === state.activeFieldId);
    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = delta > 0 ? 0 : fields.length - 1;
    } else {
      nextIndex = Math.max(0, Math.min(fields.length - 1, currentIndex + delta));
    }
    const nextField = fields[nextIndex];
    if (nextField) {
      target.dispatch({ name: 'active-field/set', id: nextField.id });
    }
  };

  const isNoTarget = !state.target.selectedUrl;

  const heading = document.createElement('h2');
  heading.textContent = 'Image Trail';

  const captureSection = document.createElement('div');
  captureSection.className = 'image-trail-panel__capture-actions';
  if (!isNoTarget) {
    const selectedUrl = state.target.selectedUrl;
    if (selectedUrl) {
      const captureBtn = makeButton(
        'Capture original',
        { name: 'capture/request', url: selectedUrl, sourceType: 'target' },
        target.dispatch,
        state.captureInProgress,
      );
      captureBtn.className = 'image-trail-panel__capture-btn';
      captureSection.append(captureBtn);
    }
  }

  const navSection = document.createElement('div');
  navSection.className = 'image-trail-panel__nav-actions';
  navSection.append(
    makeButton('◀ Prev', { name: 'navigate-previous' }, target.dispatch, isNoTarget),
    makeButton('Next ▶', { name: 'navigate-next' }, target.dispatch, isNoTarget),
  );

  const autoSection = document.createElement('div');
  autoSection.className = 'image-trail-panel__automation-actions';
  const auto = state.automation;
  if (auto.slideshowPhase === 'running') {
    autoSection.append(
      makeButton('Pause slideshow', { name: 'slideshow-pause' }, target.dispatch),
      makeButton('Stop slideshow', { name: 'slideshow-stop' }, target.dispatch),
    );
  } else if (auto.slideshowPhase === 'paused') {
    autoSection.append(
      makeButton('Resume slideshow', { name: 'slideshow-resume' }, target.dispatch),
      makeButton('Stop slideshow', { name: 'slideshow-stop' }, target.dispatch),
    );
  } else {
    autoSection.append(makeButton('Start slideshow', { name: 'slideshow-start' }, target.dispatch, isNoTarget));
  }

  if (auto.retryPhase === 'running') {
    autoSection.append(makeButton('Stop retry', { name: 'retry-stop' }, target.dispatch));
  } else {
    autoSection.append(makeButton('Retry 404', { name: 'retry-start' }, target.dispatch, isNoTarget));
  }

  if (auto.slideshowPhase !== 'idle' || auto.retryPhase !== 'idle') {
    autoSection.append(makeButton('Stop all', { name: 'stop-all' }, target.dispatch));
  }

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  actions.append(
    makeButton('Ping status', { name: 'ping-status' }, target.dispatch),
    makeButton('Close', { name: 'close-panel' }, target.dispatch),
  );

  target.root.append(
    heading,
    createStatusView(state, target.dispatch),
    createTargetPickerView(state.target, target.dispatch),
    createControlsView({
      onPrevious: () => dispatchActiveField(-1),
      onNext: () => dispatchActiveField(1),
    }),
    createFieldsView(fields, state.activeFieldId),
    createUrlEditorView({ url: state.target.selectedUrl }),
    captureSection,
    navSection,
    autoSection,
    createHistoryView(state.history, state.captureInProgress, target.dispatch),
    createBookmarksView(state.target.selectedUrl, state.bookmarks, state.captureInProgress, target.dispatch),
    actions,
  );
}
