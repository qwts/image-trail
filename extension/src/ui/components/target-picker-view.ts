import type { PanelAction, TargetState } from '../../core/types.js';
import { OBJECT_FIT_MODES, isObjectFitMode } from '../../core/preview-style.js';
import { PRIVACY_URL_TEXT } from './record-metadata.js';

let targetUtilityOpen: boolean | null = null;

export function createTargetPickerView(
  target: TargetState,
  dispatch: (action: PanelAction) => void,
  options: { readonly privacyMode?: boolean } = {},
): HTMLElement {
  const targetNeedsAttention = target.picking || target.grabModeActive || target.mode !== 'auto' || target.candidateCount !== 1;
  const wrapper = document.createElement('details');
  wrapper.className = 'image-trail-panel__section image-trail-panel__target-utility';
  wrapper.open = targetNeedsAttention || (targetUtilityOpen ?? false);
  wrapper.addEventListener('toggle', () => {
    if (targetNeedsAttention) {
      if (!wrapper.open) wrapper.open = true;
      return;
    }
    targetUtilityOpen = wrapper.open;
  });

  const heading = document.createElement('summary');
  heading.className = 'image-trail-panel__target-summary';
  const title = document.createElement('h3');
  title.textContent = 'Host target';
  const summaryMeta = document.createElement('span');
  summaryMeta.className = 'image-trail-panel__target-count';
  summaryMeta.textContent = `${target.candidateCount} candidate${target.candidateCount === 1 ? '' : 's'}`;
  heading.append(title, summaryMeta);

  const description = document.createElement('p');
  description.className = 'image-trail-panel__meta';
  description.textContent = target.grabModeActive
    ? 'Grab Mode is active. Click page images to add them to the queue.'
    : target.selectedUrl
      ? `Rows and URL edits project into this host image.`
      : `Choose which page image receives the current edited URL. ${target.candidateCount} candidate${target.candidateCount === 1 ? '' : 's'} detected.`;

  const current = document.createElement('p');
  current.className = 'image-trail-panel__target-url';
  if (options.privacyMode && target.selectedUrl) current.classList.add('is-privacy-masked');
  current.textContent =
    options.privacyMode && target.selectedUrl
      ? PRIVACY_URL_TEXT
      : target.selectedUrl?.startsWith('data:')
        ? 'data URL'
        : (target.selectedUrl ?? 'No host image selected yet.');
  current.title =
    options.privacyMode && target.selectedUrl
      ? 'Privacy mode is hiding this URL for screen sharing.'
      : (target.selectedUrl ?? current.textContent);

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  const targetButton = document.createElement('button');
  targetButton.type = 'button';
  if (target.picking) {
    targetButton.textContent = 'Cancel host pick';
    targetButton.addEventListener('click', () => dispatch({ name: 'stop-target-picker' }));
  } else if (target.selectedUrl) {
    targetButton.textContent = 'Release host image';
    targetButton.addEventListener('click', () => dispatch({ name: 'target/release' }));
  } else {
    targetButton.textContent = 'Set host image';
    targetButton.addEventListener('click', () => dispatch({ name: 'start-target-picker' }));
  }
  actions.append(targetButton);
  if (target.selectedUrl) {
    const fillButton = document.createElement('button');
    fillButton.type = 'button';
    fillButton.textContent = target.fillScreen ? 'Fit in page' : 'Fill screen';
    fillButton.className = target.fillScreen ? 'is-active' : '';
    fillButton.setAttribute('aria-pressed', target.fillScreen ? 'true' : 'false');
    fillButton.title = target.fillScreen
      ? 'Restore the host image to the page layout while keeping it selected.'
      : 'Resize the selected host image to fill the page preview area.';
    fillButton.addEventListener('click', () => dispatch({ name: 'target/fill-screen', enabled: !target.fillScreen }));
    actions.append(fillButton);

    const fitLabel = document.createElement('label');
    fitLabel.className = 'image-trail-panel__target-fit';
    const fitText = document.createElement('span');
    fitText.textContent = 'Fit';
    const fitSelect = document.createElement('select');
    fitSelect.className = 'image-trail-panel__target-fit-select';
    fitSelect.setAttribute('aria-label', 'Preview object fit');
    for (const mode of OBJECT_FIT_MODES) {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode;
      option.selected = target.objectFit === mode;
      fitSelect.append(option);
    }
    fitSelect.addEventListener('change', () => {
      if (isObjectFitMode(fitSelect.value)) dispatch({ name: 'target/set-object-fit', mode: fitSelect.value });
    });
    fitLabel.append(fitText, fitSelect);
    actions.append(fitLabel);
  }
  const grabButton = document.createElement('button');
  grabButton.type = 'button';
  grabButton.textContent = target.grabModeActive ? 'Stop Grab Mode' : 'Grab Mode';
  grabButton.className = target.grabModeActive ? 'is-active' : '';
  grabButton.setAttribute('aria-pressed', target.grabModeActive ? 'true' : 'false');
  grabButton.addEventListener('click', () => dispatch({ name: target.grabModeActive ? 'grab-mode/stop' : 'grab-mode/start' }));
  actions.append(grabButton);
  if (target.selectedUrl && target.selectedDimensions) {
    const dimensions = document.createElement('span');
    dimensions.className = 'image-trail-panel__target-badge is-selected';
    dimensions.textContent = target.selectedDimensions;
    actions.append(dimensions);
  }

  const body = document.createElement('div');
  body.className = 'image-trail-panel__target-body';
  body.append(description, current, actions);

  wrapper.append(heading, body);
  return wrapper;
}
