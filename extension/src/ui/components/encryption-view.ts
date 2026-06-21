import type { PanelAction } from '../../core/types.js';

let keyBackupFilePickerId = 0;

type EncryptionAction = Extract<
  PanelAction,
  {
    readonly name:
      | 'blob-key/setup'
      | 'blob-key/unlock'
      | 'blob-key/clear'
      | 'blob-key/export'
      | 'blob-key/import'
      | 'capture/cleanup-orphans';
  }
>;

export function createEncryptionView(
  state: {
    readonly unlocked: boolean;
    readonly keyReference: string | null;
    readonly hasKey: boolean;
    readonly busy: boolean;
    readonly abandonedOriginalCount: number;
  },
  dispatch: (action: EncryptionAction) => void,
): HTMLElement {
  const section = document.createElement('details');
  section.className = 'image-trail-panel__section image-trail-panel__encryption';
  section.open = true;

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
  cleanup.disabled = state.busy;
  cleanup.addEventListener('click', () => dispatch({ name: 'capture/cleanup-orphans' }));

  if (state.unlocked) {
    if (state.abandonedOriginalCount > 0) {
      const actions = document.createElement('div');
      actions.className = 'image-trail-panel__actions';
      actions.append(cleanup);
      body.append(actions);
    }
    body.append(createKeyBackupControls(state, dispatch), createLockControls(state, dispatch));
    section.append(summary, body);
    return section;
  }

  const password = document.createElement('input');
  password.type = 'password';
  password.placeholder = 'Encryption password';
  password.autocomplete = 'current-password';
  password.className = 'image-trail-panel__password-input';
  password.disabled = state.busy;

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
  setup.disabled = state.busy;
  setup.addEventListener('click', () => {
    dispatch({ name: 'blob-key/setup', password: password.value });
    password.value = '';
  });

  const unlock = document.createElement('button');
  unlock.type = 'button';
  unlock.textContent = 'Unlock';
  unlock.className = 'image-trail-panel__primary-action';
  unlock.disabled = state.busy;
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
  body.append(password, actions, createKeyBackupControls(state, dispatch));
  section.append(summary, body);
  return section;
}

function createKeyBackupControls(
  state: { readonly hasKey: boolean; readonly busy: boolean },
  dispatch: (action: EncryptionAction) => void,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection';

  const label = document.createElement('h4');
  label.textContent = 'Key backup';

  const password = document.createElement('input');
  password.type = 'password';
  password.placeholder = 'Backup password';
  password.autocomplete = 'new-password';
  password.className = 'image-trail-panel__password-input';
  password.disabled = state.busy;

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.className = 'image-trail-panel__file-input';
  file.disabled = state.busy;

  const exportKey = document.createElement('button');
  exportKey.type = 'button';
  exportKey.textContent = 'Export key backup';
  exportKey.className = 'image-trail-panel__secondary-action';
  exportKey.disabled = state.busy;
  exportKey.addEventListener('click', () => {
    dispatch({ name: 'blob-key/export', password: password.value });
    password.value = '';
  });

  const importKey = document.createElement('button');
  importKey.type = 'button';
  importKey.textContent = 'Import key backup';
  importKey.className = 'image-trail-panel__secondary-action';
  importKey.disabled = state.busy;
  importKey.addEventListener('click', () => {
    readFileInput(file, (fileContent) => {
      dispatch({ name: 'blob-key/import', fileContent, password: password.value });
      password.value = '';
      file.value = '';
    });
  });

  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__control-stack';
  controls.append(password);
  if (!state.hasKey) controls.append(createKeyBackupFilePicker(file));

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  if (state.hasKey) {
    actions.append(exportKey);
  } else {
    actions.append(importKey);
  }

  group.append(label, controls, actions);
  return group;
}

function createKeyBackupFilePicker(input: HTMLInputElement): HTMLElement {
  const id = `image-trail-key-backup-file-${(keyBackupFilePickerId += 1)}`;
  input.id = id;

  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__file-picker';

  const label = document.createElement('label');
  label.className = 'image-trail-panel__file-picker-button';
  label.htmlFor = id;
  label.textContent = 'Choose key backup';

  const name = document.createElement('span');
  name.className = 'image-trail-panel__file-picker-name';
  name.textContent = 'No key backup selected';

  input.addEventListener('change', () => {
    name.textContent = input.files?.[0]?.name ?? 'No key backup selected';
  });

  wrapper.append(input, label, name);
  return wrapper;
}

function createLockControls(state: { readonly busy: boolean }, dispatch: (action: EncryptionAction) => void): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  let confirming = false;

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear key';
  clear.title = 'Removes the stored encrypted originals key. Export a key backup first.';
  clear.className = 'image-trail-panel__secondary-action';
  clear.disabled = state.busy;
  clear.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      clear.textContent = 'Confirm clear key';
      clear.classList.add('is-danger');
      clear.title = 'Click again to remove the stored key. Encrypted originals need an imported backup key to recover.';
      return;
    }
    dispatch({ name: 'blob-key/clear' });
  });

  actions.append(clear);
  return actions;
}

function readFileInput(input: HTMLInputElement, onRead: (fileContent: string) => void): void {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') onRead(reader.result);
  };
  reader.readAsText(file);
}
