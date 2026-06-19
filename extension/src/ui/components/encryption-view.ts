import type { PanelAction } from '../../core/types.js';

type EncryptionAction = Extract<PanelAction, { readonly name: 'blob-key/setup' | 'blob-key/unlock' }>;

export function createEncryptionView(dispatch: (action: EncryptionAction) => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__encryption';

  const heading = document.createElement('h3');
  heading.textContent = 'Encrypted originals';

  const description = document.createElement('p');
  description.className = 'image-trail-panel__meta';
  description.textContent = 'Set up or unlock encrypted blob storage before capturing original image bytes.';

  const password = document.createElement('input');
  password.type = 'password';
  password.placeholder = 'Encryption password';
  password.autocomplete = 'current-password';
  password.className = 'image-trail-panel__password-input';

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';

  const setup = document.createElement('button');
  setup.type = 'button';
  setup.textContent = 'Set up key';
  setup.addEventListener('click', () => {
    dispatch({ name: 'blob-key/setup', password: password.value });
    password.value = '';
  });

  const unlock = document.createElement('button');
  unlock.type = 'button';
  unlock.textContent = 'Unlock';
  unlock.addEventListener('click', () => {
    dispatch({ name: 'blob-key/unlock', password: password.value });
    password.value = '';
  });

  actions.append(setup, unlock);
  section.append(heading, description, password, actions);
  return section;
}
