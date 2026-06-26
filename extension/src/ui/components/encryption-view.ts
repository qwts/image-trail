import type { PanelAction } from '../../core/types.js';
import { createActionGroup } from './action-group.js';
import { createFilePickerField, createPasswordField } from './form-controls.js';

let encryptedOriginalsOpen = true;

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
  section.classList.toggle('is-waiting', state.busy);
  section.open = encryptedOriginalsOpen;
  section.addEventListener('toggle', () => {
    encryptedOriginalsOpen = section.open;
  });

  const header = document.createElement('div');
  header.className = 'image-trail-panel__encryption-header';

  const heading = document.createElement('h3');
  heading.textContent = 'Encrypted originals';

  const badge = document.createElement('span');
  badge.className = `image-trail-panel__encryption-badge${state.unlocked ? ' is-unlocked' : ''}${state.busy ? ' is-waiting' : ''}`;
  badge.textContent = state.busy ? 'Working' : state.unlocked ? 'Unlocked' : 'AES-GCM';

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
  cleanup.textContent = state.busy ? 'Working...' : 'Clean up unused originals';
  cleanup.className = 'image-trail-panel__secondary-action';
  cleanup.classList.toggle('is-waiting', state.busy);
  cleanup.disabled = state.busy;
  cleanup.addEventListener('click', () => dispatch({ name: 'capture/cleanup-orphans' }));

  if (state.unlocked) {
    if (state.abandonedOriginalCount > 0) {
      body.append(createActionGroup('Maintenance', [cleanup], { secondary: true }));
    }
    body.append(createKeyBackupControls(state, dispatch), createLockControls(state, dispatch));
    section.append(summary, body);
    return section;
  }

  const passwordControl = createPasswordField({
    label: state.hasKey ? 'Encrypted originals password' : 'New encrypted originals password',
    description: state.hasKey
      ? 'Unlocks encrypted original image storage for this browser session.'
      : 'Creates the first key used to protect captured original image bytes.',
    placeholder: 'Encryption password',
    autocomplete: state.hasKey ? 'current-password' : 'new-password',
    disabled: state.busy,
  });
  const password = passwordControl.input;

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
  setup.textContent = state.busy ? 'Creating key...' : 'Create first key';
  setup.className = 'image-trail-panel__secondary-action';
  setup.classList.toggle('is-waiting', state.busy);
  setup.disabled = state.busy;
  setup.addEventListener('click', () => {
    dispatch({ name: 'blob-key/setup', password: password.value });
    password.value = '';
  });

  const unlock = document.createElement('button');
  unlock.type = 'button';
  unlock.textContent = state.busy ? 'Unlocking...' : 'Unlock';
  unlock.className = 'image-trail-panel__primary-action';
  unlock.classList.toggle('is-waiting', state.busy);
  unlock.disabled = state.busy;
  unlock.addEventListener('click', unlockWithPassword);

  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      unlockWithPassword();
    }
  });

  body.append(
    passwordControl.field,
    createActionGroup(state.hasKey ? 'Unlock storage' : 'Setup', [state.hasKey ? unlock : setup]),
    createKeyBackupControls(state, dispatch),
  );
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
  label.className = 'image-trail-panel__action-group-title';
  label.textContent = 'Key backup';

  const passwordControl = createPasswordField({
    label: 'Password',
    description: state.hasKey
      ? 'Protects the exported key backup file with a password.'
      : 'Unlocks the selected key backup file before importing it.',
    placeholder: 'Backup password',
    autocomplete: state.hasKey ? 'new-password' : 'current-password',
    disabled: state.busy,
  });
  const password = passwordControl.input;

  const fileControl = createFilePickerField({
    label: 'Key backup file',
    description: 'Choose a previously exported Image Trail key backup JSON file.',
    buttonText: 'Choose key backup',
    noFileText: 'No key backup selected',
    accept: '.json,application/json',
    disabled: state.busy,
  });
  const file = fileControl.input;

  const exportKey = document.createElement('button');
  exportKey.type = 'button';
  exportKey.textContent = state.busy ? 'Working...' : 'Export key backup';
  exportKey.className = 'image-trail-panel__secondary-action';
  exportKey.classList.toggle('is-waiting', state.busy);
  exportKey.disabled = state.busy;
  exportKey.addEventListener('click', () => {
    dispatch({ name: 'blob-key/export', password: password.value });
    password.value = '';
  });

  const importKey = document.createElement('button');
  importKey.type = 'button';
  importKey.textContent = state.busy ? 'Working...' : 'Import key backup';
  importKey.className = 'image-trail-panel__secondary-action';
  importKey.classList.toggle('is-waiting', state.busy);
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
  controls.append(passwordControl.field);
  if (!state.hasKey) controls.append(fileControl.field);

  group.append(label, controls, createActionGroup('Backup file', [state.hasKey ? exportKey : importKey]));
  return group;
}

function createLockControls(state: { readonly busy: boolean }, dispatch: (action: EncryptionAction) => void): HTMLElement {
  let confirming = false;

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = state.busy ? 'Working...' : 'Clear key';
  clear.title = 'Removes the stored encrypted originals key. Export a key backup first.';
  clear.className = 'image-trail-panel__secondary-action';
  clear.classList.toggle('is-waiting', state.busy);
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

  return createActionGroup('Key removal', [clear], { secondary: true });
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
