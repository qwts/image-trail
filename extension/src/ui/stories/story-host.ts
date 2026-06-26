import { action } from 'storybook/actions';

export function mockDispatch<Action>(label = 'story action'): (action: Action) => void {
  return action(label);
}

export function panelStory(element: HTMLElement, options: { readonly width?: number } = {}): HTMLElement {
  const host = document.createElement('div');
  host.className = 'image-trail-panel-root image-trail-panel';
  host.style.position = 'relative';
  host.style.inset = 'auto';
  host.style.margin = '16px';
  if (options.width) {
    host.style.width = `${options.width}px`;
    host.style.inlineSize = `${options.width}px`;
  }
  host.append(element);
  return host;
}

export function drawerStory(drawer: HTMLElement): HTMLElement {
  const host = document.createElement('div');
  host.style.minBlockSize = '520px';
  host.style.background = '#101010';
  host.style.padding = '16px';
  host.append(drawer);
  return host;
}

export function storyButton(label: string, options: { readonly primary?: boolean; readonly danger?: boolean } = {}): HTMLButtonElement {
  const dispatch = action('story action');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (options.primary) button.classList.add('image-trail-panel__primary-action');
  if (options.danger) button.classList.add('is-danger');
  button.addEventListener('click', () => dispatch({ label }));
  return button;
}
