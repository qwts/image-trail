import type { PanelAction, TargetState } from '../../core/types.js';
import { OBJECT_FIT_MODES, isObjectFitMode } from '../../core/preview-style.js';
import { PRIVACY_URL_TEXT } from './record-metadata.js';
import { createBadge, createButton, createSelect } from './primitives.js';

let targetUtilityOpen: boolean | null = null;

export function createTargetPickerView(
  target: TargetState,
  dispatch: (action: PanelAction) => void,
  options: { readonly privacyMode?: boolean } = {},
): HTMLElement {
  const targetNeedsAttention = target.picking || target.grabModeActive || target.mode !== 'auto' || target.candidateCount !== 1;
  const wrapper = document.createElement('details');
  wrapper.className = 'image-trail-panel__section image-trail-panel__target-utility image-trail-ds__target';
  wrapper.open = targetNeedsAttention || (targetUtilityOpen ?? false);
  wrapper.addEventListener('toggle', () => {
    if (targetNeedsAttention) {
      if (!wrapper.open) wrapper.open = true;
      return;
    }
    targetUtilityOpen = wrapper.open;
  });

  const heading = document.createElement('summary');
  heading.className = 'image-trail-panel__target-summary image-trail-ds__section-header';
  const title = document.createElement('h3');
  title.className = 'image-trail-ds__section-title';
  title.textContent = 'Host target';
  const summaryMeta = createBadge({
    label: `${target.candidateCount} candidate${target.candidateCount === 1 ? '' : 's'}`,
    tone: 'count',
    className: 'image-trail-panel__target-count',
  });
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
  actions.className = 'image-trail-panel__actions image-trail-ds__target-actions';
  let targetButton: HTMLButtonElement;
  if (target.picking) {
    targetButton = createButton({
      label: 'Cancel host pick',
      variant: 'danger',
      active: true,
      onClick: () => dispatch({ name: 'stop-target-picker' }),
    });
  } else if (target.selectedUrl) {
    targetButton = createButton({ label: 'Release host image', onClick: () => dispatch({ name: 'target/release' }) });
  } else {
    targetButton = createButton({ label: 'Set host image', variant: 'primary', onClick: () => dispatch({ name: 'start-target-picker' }) });
  }
  actions.append(targetButton);
  if (target.selectedUrl) {
    const fillButton = createButton({
      label: target.fillScreen ? 'Fit in page' : 'Fill screen',
      pressed: target.fillScreen,
      title: target.fillScreen
        ? 'Restore the host image to the page layout while keeping it selected.'
        : 'Resize the selected host image to fill the page preview area.',
      onClick: () => dispatch({ name: 'target/fill-screen', enabled: !target.fillScreen }),
    });
    actions.append(fillButton);

    const fitLabel = document.createElement('label');
    fitLabel.className = 'image-trail-panel__target-fit';
    const fitText = document.createElement('span');
    fitText.textContent = 'Fit';
    const fitSelect = createSelect({
      ariaLabel: 'Preview object fit',
      value: target.objectFit,
      items: OBJECT_FIT_MODES.map((mode) => ({ value: mode, label: mode })),
      className: 'image-trail-panel__target-fit-select',
      onChange: () => {
        if (isObjectFitMode(fitSelect.value)) dispatch({ name: 'target/set-object-fit', mode: fitSelect.value });
      },
    });
    fitLabel.append(fitText, fitSelect);
    actions.append(fitLabel);
  }
  if (target.selectedUrl && target.selectedDimensions) {
    const dimensions = createBadge({
      label: target.selectedDimensions,
      tone: 'selected',
      className: 'image-trail-panel__target-badge is-selected',
    });
    actions.append(dimensions);
  }

  const body = document.createElement('div');
  body.className = 'image-trail-panel__target-body';
  body.append(description, current, actions);

  wrapper.append(heading, body);
  return wrapper;
}
