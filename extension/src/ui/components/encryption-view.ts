import type { PanelAction } from '../../core/types.js';

type EncryptionAction = Extract<PanelAction, { readonly name: 'blob-key/setup' | 'blob-key/unlock' | 'capture/cleanup-orphans' }>;

export function createEncryptionView(
  state: { readonly unlocked: boolean; readonly keyReference: string | null; readonly hasKey: boolean; readonly storedOriginalCount: number },
  dispatch: (action: EncryptionAction) => void,
): HTMLElement {
  const section = document.createElement('details');
  section.className = 'image-trail-panel__section image-trail-panel__encryption';
  section.open = !state.unlocked;

  const header = document.createElement('div');
  header.className = 'image-trail-panel__encryption-header';

  const heading = document.createElement('h3');
  heading.textContent = 'Encrypted originals';

  const badge = document.createElement('span');
  badge.className = `image-trail-panel__encryption-badge${state.unlocked ? ' is-unlocked' : ''}`;
  badge.textContent = state.unlocked ? 'Unlocked' : 'AES-GCM';

  header.append(heading, badge);

  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__encryption-summary';
  summary.append(header);

  const body = document.createElement('div');
  body.className = 'image-trail-panel__encryption-body';

  const description = document.createElement('p');
  description.className = 'image-trail-panel__meta';
  description.textContent = state.unlocked
    ? `Encrypted capture is unlocked${state.keyReference ? ` with ${state.keyReference}` : ''}.`
    : state.hasKey
      ? 'Unlock encrypted blob storage before capturing original image bytes.'
      : 'Create the first encrypted blob storage key before capturing original image bytes.';

  body.append(description);

  const cleanup = document.createElement('button');
  cleanup.type = 'button';
  cleanup.textContent = 'Clean up unused originals';
  cleanup.className = 'image-trail-panel__secondary-action';
  cleanup.addEventListener('click', () => dispatch({ name: 'capture/cleanup-orphans' }));

  if (state.unlocked) {
    if (state.storedOriginalCount > 0) {
      const actions = document.createElement('div');
      actions.className = 'image-trail-panel__actions';
      actions.append(cleanup);
      body.append(actions);
    }
    section.append(summary, body);
    return section;
  }

  const password = document.createElement('input');
  password.type = 'password';
  password.placeholder = 'Encryption password';
  password.autocomplete = 'current-password';
  password.className = 'image-trail-panel__password-input';

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';

  const unlockWithPassword = (): void => {
    if (!state.hasKey) {
      dispatch({ name: 'blob-key/setup', password: password.value });
      password.value = '';
      return;
    }
    dispatch({ name: 'blob-key/unlock', password: password.value });
    password.value = '';
  };

  const setup = document.createElement('button');
  setup.type = 'button';
  setup.textContent = 'Create first key';
  setup.className = 'image-trail-panel__secondary-action';
  setup.addEventListener('click', () => {
    dispatch({ name: 'blob-key/setup', password: password.value });
    password.value = '';
  });

  const unlock = document.createElement('button');
  unlock.type = 'button';
  unlock.textContent = 'Unlock';
  unlock.className = 'image-trail-panel__primary-action';
  unlock.addEventListener('click', unlockWithPassword);

  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      unlockWithPassword();
    }
  });

  if (state.hasKey) {
    actions.append(unlock);
  } else {
    actions.append(setup);
  }
  body.append(password, actions);
  section.append(summary, body);
  return section;
}
