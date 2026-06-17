import type { PanelAction, TargetState } from '../../core/types.js';

export function createTargetPickerView(target: TargetState, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'image-trail-panel__section image-trail-panel__target';

  const heading = document.createElement('h3');
  heading.textContent = 'Target image';

  const summary = document.createElement('p');
  summary.textContent = target.selectedUrl
    ? `Selected ${target.selectedDimensions ?? 'image'} from ${target.mode} selection.`
    : `${target.candidateCount} candidate${target.candidateCount === 1 ? '' : 's'} available.`;

  const url = document.createElement('p');
  url.className = 'image-trail-panel__target-url';
  url.textContent = target.selectedUrl ?? target.message;

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  const pickButton = document.createElement('button');
  pickButton.type = 'button';
  pickButton.textContent = target.picking ? 'Stop picking' : 'Pick target';
  pickButton.addEventListener('click', () => dispatch({ name: target.picking ? 'stop-target-picker' : 'start-target-picker' }));
  actions.append(pickButton);

  wrapper.append(heading, summary, url, actions);
  return wrapper;
}
