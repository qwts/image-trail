import type { PanelAction, PanelState } from '../core/types.js';

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

  const status = document.createElement('p');
  status.className = 'image-trail-panel__status';
  status.textContent = state.message;

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__meta';
  meta.textContent = `Status: ${state.status} · Updated: ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`;

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  actions.append(
    makeButton('Ping status', { name: 'ping-status' }, target.dispatch),
    makeButton('Close', { name: 'close-panel' }, target.dispatch),
  );

  target.root.append(heading, status, meta, actions);
}
