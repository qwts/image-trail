import type { PanelAction, PanelState } from '../../core/types.js';
import { createButton, createKbd, createSectionHeader } from './primitives.js';

export interface ManualControlsViewOptions {
  readonly state: Pick<PanelState, 'automation' | 'captureInProgress' | 'pageContext' | 'secondaryControlsOpen' | 'target'>;
  readonly previousFieldId: string | null;
  readonly nextFieldId: string | null;
  readonly dispatch: (action: PanelAction) => void;
}

function actionButton(
  label: string,
  action: PanelAction | null,
  dispatch: (action: PanelAction) => void,
  options: {
    readonly ariaLabel?: string;
    readonly title?: string;
    readonly variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'danger';
    readonly active?: boolean;
    readonly pressed?: boolean;
    readonly waiting?: boolean;
    readonly disabled?: boolean;
    readonly className?: string;
  } = {},
): HTMLButtonElement {
  return createButton({ label, ...options, ...(action ? { onClick: () => dispatch(action) } : {}) });
}

function createPrimaryWorkflow(state: ManualControlsViewOptions['state'], dispatch: ManualControlsViewOptions['dispatch']): HTMLElement {
  const noTarget = state.target.selectedUrl === null;
  const primary = document.createElement('div');
  primary.className = 'image-trail-panel__primary-workflow';
  primary.append(
    actionButton('◀ Prev', { name: 'navigate-previous' }, dispatch, { title: 'Previous image', disabled: noTarget }),
    actionButton('Next ▶', { name: 'navigate-next' }, dispatch, { title: 'Next image', disabled: noTarget }),
    actionButton(
      '◉ Capture',
      state.target.selectedUrl ? { name: 'capture/request', url: state.target.selectedUrl, sourceType: 'target' } : null,
      dispatch,
      {
        ariaLabel: 'Capture original',
        title: 'Capture original',
        variant: 'primary',
        waiting: state.captureInProgress,
        disabled: noTarget || state.captureInProgress,
        className: 'image-trail-panel__capture-btn',
      },
    ),
  );

  const phase = state.automation.slideshowPhase;
  const slideshowAction: PanelAction =
    phase === 'running' ? { name: 'slideshow-pause' } : phase === 'paused' ? { name: 'slideshow-resume' } : { name: 'slideshow-start' };
  const slideshowLabel = phase === 'running' ? 'Pause slideshow' : phase === 'paused' ? 'Resume slideshow' : 'Start slideshow';
  const slideshowActive = phase === 'running' || phase === 'paused';
  primary.append(
    actionButton(phase === 'running' ? '⏸ Slideshow' : '⏵ Slideshow', slideshowAction, dispatch, {
      ariaLabel: slideshowLabel,
      title: slideshowLabel,
      active: slideshowActive,
      pressed: slideshowActive,
      disabled: noTarget && !slideshowActive,
    }),
  );
  if (state.pageContext.effective !== 'single') {
    primary.append(
      actionButton('⌖ Grab', { name: state.target.grabModeActive ? 'grab-mode/stop' : 'grab-mode/start' }, dispatch, {
        ariaLabel: state.target.grabModeActive ? 'Stop Grab Mode' : 'Grab Mode',
        title: state.target.grabModeActive ? 'Stop Grab Mode' : 'Start Grab Mode',
        active: state.target.grabModeActive,
        pressed: state.target.grabModeActive,
      }),
    );
  }
  return primary;
}

function appendContextHints(section: HTMLElement, state: ManualControlsViewOptions['state']): void {
  const captureHint = document.createElement('p');
  captureHint.className = 'image-trail-panel__workflow-meta image-trail-panel__capture-hint';
  captureHint.append(document.createTextNode('Press '), createKbd('C'), document.createTextNode(' to capture the current image.'));
  section.append(captureHint);
  if (state.pageContext.effective !== 'feed') return;
  const feedHint = document.createElement('p');
  feedHint.className = 'image-trail-panel__workflow-meta image-trail-panel__feed-hint';
  feedHint.classList.toggle('is-active', state.target.grabModeActive);
  feedHint.textContent = state.target.grabModeActive
    ? 'Click images in the feed to pin them.'
    : 'Turn on Grab mode, then click feed images to pin.';
  section.append(feedHint);
}

export function createManualControlsView(options: ManualControlsViewOptions): HTMLElement {
  const { state, dispatch } = options;
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__secondary-controls image-trail-ds__workflow';
  section.append(createSectionHeader({ title: 'Controls', className: 'image-trail-panel__section-header', divider: false }));

  const trailStatus = document.createElement('p');
  trailStatus.className = 'image-trail-panel__workflow-meta';
  trailStatus.textContent =
    options.previousFieldId || options.nextFieldId
      ? 'Trail fields step together with Prev/Next.'
      : 'Add a field to the Trail to walk it with Prev/Next.';
  section.append(trailStatus);

  section.append(createPrimaryWorkflow(state, dispatch));
  appendContextHints(section, state);

  const details = document.createElement('details');
  details.className = 'image-trail-panel__secondary-controls-details';
  details.open = state.secondaryControlsOpen;
  details.addEventListener('toggle', () => {
    if (details.open !== state.secondaryControlsOpen) dispatch({ name: 'panel/secondary-controls-open', open: details.open });
  });
  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__secondary-controls-summary';
  summary.textContent = 'More controls';
  const body = document.createElement('div');
  body.className = 'image-trail-panel__secondary-controls-body';

  const fieldActions = document.createElement('div');
  fieldActions.className = 'image-trail-panel__actions image-trail-panel__field-navigation';
  fieldActions.append(
    actionButton('Previous field', options.previousFieldId ? { name: 'active-field/set', id: options.previousFieldId } : null, dispatch, {
      variant: 'ghost',
      disabled: options.previousFieldId === null,
    }),
    actionButton('Next field', options.nextFieldId ? { name: 'active-field/set', id: options.nextFieldId } : null, dispatch, {
      variant: 'ghost',
      disabled: options.nextFieldId === null,
    }),
  );
  body.append(fieldActions);

  const automation = document.createElement('div');
  automation.className = 'image-trail-panel__automation-actions';
  const noTarget = state.target.selectedUrl === null;
  automation.append(
    state.automation.retryPhase === 'running'
      ? actionButton('Stop retry', { name: 'retry-stop' }, dispatch, { variant: 'danger' })
      : actionButton('Retry 404', { name: 'retry-start' }, dispatch, { disabled: noTarget }),
  );
  if (state.automation.slideshowPhase !== 'idle') automation.append(actionButton('Stop slideshow', { name: 'slideshow-stop' }, dispatch));
  if (state.automation.slideshowPhase !== 'idle' || state.automation.retryPhase !== 'idle') {
    automation.append(actionButton('Stop all', { name: 'stop-all' }, dispatch, { variant: 'danger' }));
  }
  body.append(automation);
  details.append(summary, body);
  section.append(details);
  return section;
}
