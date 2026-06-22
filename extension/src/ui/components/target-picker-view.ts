import type { PanelAction, TargetState } from '../../core/types.js';
import { PRIVACY_URL_TEXT } from './record-metadata.js';

export function createTargetPickerView(
  target: TargetState,
  dispatch: (action: PanelAction) => void,
  options: { readonly privacyMode?: boolean } = {},
): HTMLElement {
  const wrapper = document.createElement('details');
  wrapper.className = 'image-trail-panel__section image-trail-panel__target-utility';
  wrapper.open = target.picking || target.mode !== 'auto' || target.candidateCount !== 1;

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
  description.textContent = target.selectedUrl
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
