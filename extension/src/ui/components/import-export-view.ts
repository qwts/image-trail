import type { ImportedEncryptedImageFile, ImportedImageFile } from '../../core/types.js';

export type ImportExportAction =
  | { readonly name: 'selection/select-visible' }
  | { readonly name: 'export/history'; readonly password: string; readonly plaintext: boolean }
  | { readonly name: 'export/bookmarks'; readonly password: string; readonly plaintext: boolean }
  | { readonly name: 'export/url-review-status' }
  | { readonly name: 'clear/url-review-status' }
  | { readonly name: 'export/image'; readonly saveAs?: boolean }
  | { readonly name: 'export/encrypted-image' }
  | { readonly name: 'import/history'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'import/bookmarks'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'import/url-review-status'; readonly fileContent: string }
  | { readonly name: 'import/bookmarklet'; readonly fileContent: string }
  | { readonly name: 'import/image'; readonly files: readonly ImportedImageFile[] }
  | { readonly name: 'import/encrypted-image'; readonly files: readonly ImportedEncryptedImageFile[] };

export interface ImportExportViewState {
  readonly busy: boolean;
  readonly currentImageUrl: string | null;
  readonly selectedHistoryCount: number;
  readonly selectedBookmarkCount: number;
  readonly selectedImageDownloadCount: number;
  readonly visibleImageSelectionCount: number;
  readonly imageDownloadAvailable: boolean;
  readonly encryptedImageTransferAvailable: boolean;
  readonly blobKeyUnlocked: boolean;
  readonly lastMessage?: string;
  readonly lastMessageIsError?: boolean;
}

let filePickerId = 0;

export function createImageTransferView(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__image-transfer';

  const heading = document.createElement('h3');
  heading.textContent = 'Image';
  section.append(heading);

  if (state.lastMessage) {
    const msg = document.createElement('p');
    msg.className = state.lastMessageIsError ? 'image-trail-panel__meta image-trail-panel__error' : 'image-trail-panel__meta';
    msg.textContent = state.lastMessage;
    section.append(msg);
  }

  section.append(createImageGroup(state, dispatch));

  return section;
}

export function createImportExportView(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__import-export';

  const heading = document.createElement('h3');
  heading.textContent = 'Import / Export';
  section.append(heading);

  if (state.lastMessage) {
    const msg = document.createElement('p');
    msg.className = state.lastMessageIsError ? 'image-trail-panel__meta image-trail-panel__error' : 'image-trail-panel__meta';
    msg.textContent = state.lastMessage;
    section.append(msg);
  }

  section.append(createExportGroup(state, dispatch), createImportGroup(state, dispatch));

  return section;
}

function createExportGroup(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection';

  const label = document.createElement('h4');
  label.textContent = 'Export';
  group.append(label);

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.placeholder = 'Export password';
  passwordInput.autocomplete = 'new-password';
  passwordInput.className = 'image-trail-panel__password-input';

  const plaintext = createToggle('Plaintext');

  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__control-stack';
  controls.append(passwordInput, plaintext.label);

  const historyBtn = document.createElement('button');
  historyBtn.type = 'button';
  historyBtn.textContent = state.selectedHistoryCount > 0 ? `Export selected history (${state.selectedHistoryCount})` : 'Export history';
  historyBtn.disabled = state.busy;
  historyBtn.addEventListener('click', () => {
    dispatch({ name: 'export/history', password: passwordInput.value, plaintext: plaintext.input.checked });
    passwordInput.value = '';
    updateExportControls();
  });

  const bookmarksBtn = document.createElement('button');
  bookmarksBtn.type = 'button';
  bookmarksBtn.textContent =
    state.selectedBookmarkCount > 0 ? `Export selected bookmarks (${state.selectedBookmarkCount})` : 'Export bookmarks';
  bookmarksBtn.disabled = state.busy;
  bookmarksBtn.addEventListener('click', () => {
    dispatch({ name: 'export/bookmarks', password: passwordInput.value, plaintext: plaintext.input.checked });
    passwordInput.value = '';
    updateExportControls();
  });

  const urlReviewStatusBtn = document.createElement('button');
  urlReviewStatusBtn.type = 'button';
  urlReviewStatusBtn.textContent = 'Export URL review status';
  urlReviewStatusBtn.disabled = state.busy;
  urlReviewStatusBtn.addEventListener('click', () => dispatch({ name: 'export/url-review-status' }));

  const clearUrlReviewStatusBtn = document.createElement('button');
  clearUrlReviewStatusBtn.type = 'button';
  clearUrlReviewStatusBtn.textContent = 'Clear URL review status';
  clearUrlReviewStatusBtn.disabled = state.busy;
  clearUrlReviewStatusBtn.addEventListener('click', () => dispatch({ name: 'clear/url-review-status' }));

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  actions.append(historyBtn, bookmarksBtn, urlReviewStatusBtn, clearUrlReviewStatusBtn);

  const updateExportControls = (): void => {
    const locked = state.busy || (!plaintext.input.checked && passwordInput.value.length < 4);
    historyBtn.disabled = locked;
    bookmarksBtn.disabled = locked;
    urlReviewStatusBtn.disabled = state.busy;
    clearUrlReviewStatusBtn.disabled = state.busy;
    passwordInput.disabled = plaintext.input.checked || state.busy;
  };
  passwordInput.addEventListener('input', updateExportControls);
  plaintext.input.addEventListener('change', updateExportControls);
  updateExportControls();

  group.append(controls, actions);
  return group;
}

function createImageGroup(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection';

  const imageInput = document.createElement('input');
  imageInput.type = 'file';
  imageInput.accept = 'image/*';
  imageInput.multiple = true;
  imageInput.className = 'image-trail-panel__file-input';
  imageInput.disabled = state.busy;
  const imagePicker = createFilePicker(imageInput, 'Choose images');

  const encryptedImageInput = document.createElement('input');
  encryptedImageInput.type = 'file';
  encryptedImageInput.accept = '.json,.image-trail-encrypted.json';
  encryptedImageInput.multiple = true;
  encryptedImageInput.className = 'image-trail-panel__file-input';
  encryptedImageInput.disabled = state.busy || !state.blobKeyUnlocked;
  const encryptedImagePicker = createFilePicker(encryptedImageInput, 'Choose encrypted');

  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__control-stack';
  controls.append(imagePicker, encryptedImagePicker);

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.textContent = 'Import selected';
  importBtn.disabled = state.busy;
  importBtn.addEventListener('click', () => {
    readImageFiles(imageInput, (files) => dispatch({ name: 'import/image', files }));
  });

  const importEncryptedBtn = document.createElement('button');
  importEncryptedBtn.type = 'button';
  importEncryptedBtn.textContent = 'Import encrypted';
  importEncryptedBtn.disabled = state.busy || !state.blobKeyUnlocked;
  importEncryptedBtn.addEventListener('click', () => {
    readEncryptedImageFiles(encryptedImageInput, (files) => dispatch({ name: 'import/encrypted-image', files }));
  });

  const selectEverythingBtn = document.createElement('button');
  selectEverythingBtn.type = 'button';
  selectEverythingBtn.textContent = 'Select everything shown';
  selectEverythingBtn.disabled = state.busy || state.visibleImageSelectionCount === 0;
  selectEverythingBtn.addEventListener('click', () => dispatch({ name: 'selection/select-visible' }));

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.textContent = state.selectedImageDownloadCount > 0 ? `Export images (${state.selectedImageDownloadCount})` : 'Export images';
  exportBtn.disabled = state.busy || !state.imageDownloadAvailable;
  exportBtn.addEventListener('click', (event) => {
    dispatch({ name: 'export/image', saveAs: event.shiftKey });
  });

  const exportEncryptedBtn = document.createElement('button');
  exportEncryptedBtn.type = 'button';
  exportEncryptedBtn.textContent =
    state.selectedImageDownloadCount > 0 ? `Export encrypted (${state.selectedImageDownloadCount})` : 'Export encrypted';
  exportEncryptedBtn.disabled = state.busy || !state.encryptedImageTransferAvailable;
  exportEncryptedBtn.addEventListener('click', () => {
    dispatch({ name: 'export/encrypted-image' });
  });

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  actions.append(importBtn, importEncryptedBtn, selectEverythingBtn, exportBtn, exportEncryptedBtn);

  group.append(controls, actions);
  return group;
}

function createImportGroup(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection';

  const label = document.createElement('h4');
  label.textContent = 'Import';
  group.append(label);

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.placeholder = 'Import password';
  passwordInput.autocomplete = 'current-password';
  passwordInput.className = 'image-trail-panel__password-input';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.className = 'image-trail-panel__file-input';
  const filePicker = createFilePicker(fileInput, 'Choose JSON');

  const historyBtn = document.createElement('button');
  historyBtn.type = 'button';
  historyBtn.textContent = 'Import history';
  historyBtn.disabled = state.busy;
  historyBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      dispatch({ name: 'import/history', fileContent: content, password: passwordInput.value });
      passwordInput.value = '';
    });
  });

  const bookmarksBtn = document.createElement('button');
  bookmarksBtn.type = 'button';
  bookmarksBtn.textContent = 'Import bookmarks';
  bookmarksBtn.disabled = state.busy;
  bookmarksBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      dispatch({ name: 'import/bookmarks', fileContent: content, password: passwordInput.value });
      passwordInput.value = '';
    });
  });

  const bookmarkletBtn = document.createElement('button');
  bookmarkletBtn.type = 'button';
  bookmarkletBtn.textContent = 'Import old bookmarklet data';
  bookmarkletBtn.disabled = state.busy;
  bookmarkletBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      dispatch({ name: 'import/bookmarklet', fileContent: content });
    });
  });

  const urlReviewStatusBtn = document.createElement('button');
  urlReviewStatusBtn.type = 'button';
  urlReviewStatusBtn.textContent = 'Import URL review status';
  urlReviewStatusBtn.disabled = state.busy;
  urlReviewStatusBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      dispatch({ name: 'import/url-review-status', fileContent: content });
    });
  });

  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__control-stack';
  controls.append(filePicker, passwordInput);

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  actions.append(historyBtn, bookmarksBtn, urlReviewStatusBtn, bookmarkletBtn);

  group.append(controls, actions);
  return group;
}

function createToggle(text: string): { readonly label: HTMLLabelElement; readonly input: HTMLInputElement } {
  const label = document.createElement('label');
  label.className = 'image-trail-panel__toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  const copy = document.createElement('span');
  copy.textContent = text;
  label.append(input, copy);
  return { label, input };
}

function createFilePicker(input: HTMLInputElement, text: string): HTMLElement {
  const id = `image-trail-file-${(filePickerId += 1)}`;
  input.id = id;

  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__file-picker';

  const label = document.createElement('label');
  label.className = 'image-trail-panel__file-picker-button';
  label.htmlFor = id;
  label.textContent = text;

  const name = document.createElement('span');
  name.className = 'image-trail-panel__file-picker-name';
  name.textContent = 'No file selected';

  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    name.textContent = files.length > 1 ? `${files.length} files selected` : (files[0]?.name ?? 'No file selected');
  });

  wrapper.append(input, label, name);
  return wrapper;
}

function readImageFiles(input: HTMLInputElement, onRead: (files: readonly ImportedImageFile[]) => void): void {
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/'));
  if (files.length === 0) return;
  let remaining = files.length;
  const results: ImportedImageFile[] = [];
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        results.push({ name: file.name, dataUrl: reader.result });
      }
      remaining -= 1;
      if (remaining === 0) onRead(results);
    };
    reader.onerror = () => {
      remaining -= 1;
      if (remaining === 0) onRead(results);
    };
    reader.readAsDataURL(file);
  }
}

function readEncryptedImageFiles(input: HTMLInputElement, onRead: (files: readonly ImportedEncryptedImageFile[]) => void): void {
  const files = Array.from(input.files ?? []);
  if (files.length === 0) return;
  let remaining = files.length;
  const results: Array<ImportedEncryptedImageFile | undefined> = new Array(files.length);
  files.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        results[index] = { name: file.name, fileContent: reader.result };
      }
      remaining -= 1;
      if (remaining === 0) onRead(results.filter((result): result is ImportedEncryptedImageFile => result !== undefined));
    };
    reader.onerror = () => {
      remaining -= 1;
      if (remaining === 0) onRead(results.filter((result): result is ImportedEncryptedImageFile => result !== undefined));
    };
    reader.readAsText(file);
  });
}

function readFileInput(input: HTMLInputElement, onRead: (content: string) => void, mode: 'text' | 'data-url' = 'text'): void {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') onRead(reader.result);
  };
  if (mode === 'data-url') {
    reader.readAsDataURL(file);
  } else {
    reader.readAsText(file);
  }
}
