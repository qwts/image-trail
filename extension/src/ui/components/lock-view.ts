export type LockAction =
  | { readonly name: 'lock/unlock'; readonly password: string }
  | { readonly name: 'lock/lock' }
  | { readonly name: 'lock/recall-selected'; readonly uuids: readonly string[] };

export type LockStatus = 'locked' | 'unlocked' | 'unlocking';

export interface LockViewState {
  readonly status: LockStatus;
  readonly errorMessage?: string;
  readonly recallableCount: number;
}

export function createLockView(state: LockViewState, dispatch: (action: LockAction) => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section';

  const heading = document.createElement('h3');
  heading.textContent = 'Encrypted records';
  section.append(heading);

  if (state.errorMessage) {
    const error = document.createElement('p');
    error.className = 'image-trail-panel__meta image-trail-panel__error';
    error.textContent = state.errorMessage;
    section.append(error);
  }

  if (state.status === 'locked') {
    const info = document.createElement('p');
    info.className = 'image-trail-panel__meta';
    info.textContent = `${state.recallableCount} encrypted record(s) available. Unlock to recall.`;
    section.append(info);

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Password';
    passwordInput.autocomplete = 'current-password';

    const unlockBtn = document.createElement('button');
    unlockBtn.type = 'button';
    unlockBtn.textContent = 'Unlock';
    unlockBtn.addEventListener('click', () => {
      if (passwordInput.value) {
        dispatch({ name: 'lock/unlock', password: passwordInput.value });
        passwordInput.value = '';
      }
    });

    section.append(passwordInput, unlockBtn);
  } else if (state.status === 'unlocking') {
    const info = document.createElement('p');
    info.className = 'image-trail-panel__meta';
    info.textContent = 'Unlocking…';
    section.append(info);
  } else {
    const info = document.createElement('p');
    info.className = 'image-trail-panel__meta';
    info.textContent = `Unlocked. ${state.recallableCount} record(s) available to recall.`;
    section.append(info);

    const recallBtn = document.createElement('button');
    recallBtn.type = 'button';
    recallBtn.textContent = 'Recall all into session';
    recallBtn.disabled = state.recallableCount === 0;
    recallBtn.addEventListener('click', () => {
      dispatch({ name: 'lock/recall-selected', uuids: [] });
    });

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.textContent = 'Lock';
    lockBtn.addEventListener('click', () => dispatch({ name: 'lock/lock' }));

    section.append(recallBtn, lockBtn);
  }

  return section;
}
