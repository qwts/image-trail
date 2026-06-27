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
  const inlineStart = pxNumber(drawer.style.left);
  const blockStart = pxNumber(drawer.style.top);
  const inlineSize = pxNumber(drawer.style.width, 340);
  const blockSize = pxNumber(drawer.style.height, 480);
  const gutter = 16;

  const host = document.createElement('div');
  host.style.position = 'relative';
  host.style.inlineSize = `${inlineStart + inlineSize + gutter}px`;
  host.style.minBlockSize = `${blockStart + blockSize + gutter}px`;
  host.style.background = 'transparent';
  host.style.overflow = 'hidden';

  drawer.style.position = 'absolute';
  host.append(drawer);
  return host;
}

function pxNumber(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
