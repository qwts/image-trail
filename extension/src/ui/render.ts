import type { PanelAction, PanelState } from '../core/types.js';
import { createStatusView } from './components/status-view.js';
import { createTargetPickerView } from './components/target-picker-view.js';

export interface PanelRenderTarget {
  readonly root: HTMLElement;
  readonly dispatch: (action: PanelAction) => void;
}

function makeButton(label: string, action: PanelAction, dispatch: (action: PanelAction) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => dispatch(action));
  return button;
}

export function renderPanel(target: PanelRenderTarget, state: PanelState): void {
  target.root.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = 'Image Trail';

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  actions.append(
    makeButton('Ping status', { name: 'ping-status' }, target.dispatch),
    makeButton('Close', { name: 'close-panel' }, target.dispatch),
  );

  target.root.append(heading, createStatusView(state), createTargetPickerView(state.target, target.dispatch), actions);
}
