export type ImportExportAction =
  | { readonly name: 'export/history'; readonly password: string }
  | { readonly name: 'export/bookmarks'; readonly password: string }
  | { readonly name: 'import/history'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'import/bookmarklet'; readonly fileContent: string }
  | { readonly name: 'import/key'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'export/download'; readonly password: string };

export interface ImportExportViewState {
  readonly busy: boolean;
  readonly lastMessage?: string;
  readonly lastMessageIsError?: boolean;
}

export function createImportExportView(
  state: ImportExportViewState,
  dispatch: (action: ImportExportAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section';

  const heading = document.createElement('h3');
  heading.textContent = 'Import / Export';
  section.append(heading);

  if (state.lastMessage) {
    const msg = document.createElement('p');
    msg.className = state.lastMessageIsError
      ? 'image-trail-panel__meta image-trail-panel__error'
      : 'image-trail-panel__meta';
    msg.textContent = state.lastMessage;
    section.append(msg);
  }

  section.append(
    createExportGroup(state, dispatch),
    createImportGroup(state, dispatch),
  );

  return section;
}

function createExportGroup(
  state: ImportExportViewState,
  dispatch: (action: ImportExportAction) => void,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection';

  const label = document.createElement('h4');
  label.textContent = 'Export';
  group.append(label);

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.placeholder = 'Export password';
  passwordInput.autocomplete = 'new-password';
  group.append(passwordInput);

  const historyBtn = document.createElement('button');
  historyBtn.type = 'button';
  historyBtn.textContent = 'Export history';
  historyBtn.disabled = state.busy;
  historyBtn.addEventListener('click', () => {
    if (passwordInput.value.length < 4) return;
    dispatch({ name: 'export/history', password: passwordInput.value });
    passwordInput.value = '';
  });

  const bookmarksBtn = document.createElement('button');
  bookmarksBtn.type = 'button';
  bookmarksBtn.textContent = 'Export bookmarks';
  bookmarksBtn.disabled = state.busy;
  bookmarksBtn.addEventListener('click', () => {
    if (passwordInput.value.length < 4) return;
    dispatch({ name: 'export/bookmarks', password: passwordInput.value });
    passwordInput.value = '';
  });

  group.append(historyBtn, bookmarksBtn);
  return group;
}

function createImportGroup(
  state: ImportExportViewState,
  dispatch: (action: ImportExportAction) => void,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection';

  const label = document.createElement('h4');
  label.textContent = 'Import';
  group.append(label);

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.placeholder = 'Import password';
  passwordInput.autocomplete = 'current-password';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';

  const historyBtn = document.createElement('button');
  historyBtn.type = 'button';
  historyBtn.textContent = 'Import encrypted history';
  historyBtn.disabled = state.busy;
  historyBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      if (passwordInput.value.length < 4) return;
      dispatch({ name: 'import/history', fileContent: content, password: passwordInput.value });
      passwordInput.value = '';
    });
  });

  const bookmarkletBtn = document.createElement('button');
  bookmarkletBtn.type = 'button';
  bookmarkletBtn.textContent = 'Import bookmarklet JSON';
  bookmarkletBtn.disabled = state.busy;
  bookmarkletBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      dispatch({ name: 'import/bookmarklet', fileContent: content });
    });
  });

  const keyBtn = document.createElement('button');
  keyBtn.type = 'button';
  keyBtn.textContent = 'Import key';
  keyBtn.disabled = state.busy;
  keyBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      if (passwordInput.value.length < 4) return;
      dispatch({ name: 'import/key', fileContent: content, password: passwordInput.value });
      passwordInput.value = '';
    });
  });

  group.append(fileInput, passwordInput, historyBtn, bookmarkletBtn, keyBtn);
  return group;
}

function readFileInput(input: HTMLInputElement, onRead: (content: string) => void): void {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') onRead(reader.result);
  };
  reader.readAsText(file);
}
