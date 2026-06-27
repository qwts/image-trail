import type { ImportedEncryptedImageFile, ImportedImageFile } from '../../core/types.js';
import { createActionGroup } from './action-group.js';
import { createFilePickerField, createPasswordField } from './form-controls.js';

type UrlReviewStatusClearScope = 'hostname' | 'page' | 'source' | 'all';

export type ImportExportAction =
  | { readonly name: 'selection/select-visible' }
  | { readonly name: 'export/history'; readonly password: string; readonly plaintext: boolean }
  | { readonly name: 'export/bookmarks'; readonly password: string; readonly plaintext: boolean }
  | { readonly name: 'export/url-review-status' }
  | { readonly name: 'clear/url-review-status'; readonly scope?: UrlReviewStatusClearScope }
  | { readonly name: 'export/image'; readonly saveAs?: boolean }
  | { readonly name: 'export/encrypted-image' }
  | { readonly name: 'import/history'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'import/bookmarks'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'import/url-review-status'; readonly fileContent: string }
  | { readonly name: 'import/bookmarklet'; readonly fileContent: string }
  | { readonly name: 'import/image'; readonly files: readonly ImportedImageFile[] }
  | { readonly name: 'import/encrypted-image'; readonly files: readonly ImportedEncryptedImageFile[] };

export type CloudBackupAction =
  | { readonly name: 'cloud-backup/connect'; readonly provider: 'pcloud' }
  | { readonly name: 'cloud-backup/backup-now'; readonly provider: 'pcloud' }
  | { readonly name: 'cloud-backup/choose-restore'; readonly provider: 'pcloud' }
  | { readonly name: 'cloud-backup/retry'; readonly provider: 'pcloud' }
  | { readonly name: 'cloud-backup/disconnect'; readonly provider: 'pcloud' };

export type CloudBackupConnectionState = 'disconnected' | 'connected' | 'busy' | 'error';

export interface CloudBackupProviderState {
  readonly provider: 'pcloud';
  readonly connectionState: CloudBackupConnectionState;
  readonly apiHost?: string;
  readonly folderPath?: string;
  readonly lastBackupAt?: string;
  readonly lastBackupSize?: string;
  readonly lastBackupSha256?: string;
  readonly pendingOperation?: 'connecting' | 'backing-up' | 'restoring';
  readonly restoreCandidateName?: string;
  readonly restoreCandidateSize?: string;
  readonly message?: string;
  readonly messageIsError?: boolean;
}

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

let imageUtilitiesOpen = false;
let importExportOpen = false;
let cloudBackupOpen = true;
export function createImageTransferView(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const { section, body } = createCollapsibleImportExportSection(
    'image-trail-panel__image-transfer',
    'Image utilities',
    imageUtilitiesOpen,
    (open) => {
      imageUtilitiesOpen = open;
    },
  );

  if (state.lastMessage) {
    const msg = document.createElement('p');
    msg.className = state.lastMessageIsError ? 'image-trail-panel__meta image-trail-panel__error' : 'image-trail-panel__meta';
    if (state.lastMessageIsError) msg.setAttribute('role', 'alert');
    msg.textContent = state.lastMessage;
    body.append(msg);
  }

  body.append(createImageGroup(state, dispatch));

  return section;
}

export function createImportExportView(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const { section, body } = createCollapsibleImportExportSection(
    'image-trail-panel__import-export',
    'Import / Export',
    importExportOpen,
    (open) => {
      importExportOpen = open;
    },
  );

  if (state.lastMessage) {
    const msg = document.createElement('p');
    msg.className = state.lastMessageIsError ? 'image-trail-panel__meta image-trail-panel__error' : 'image-trail-panel__meta';
    if (state.lastMessageIsError) msg.setAttribute('role', 'alert');
    msg.textContent = state.lastMessage;
    body.append(msg);
  }

  body.append(createExportGroup(state, dispatch), createImportGroup(state, dispatch));

  return section;
}

export function createCloudBackupView(state: CloudBackupProviderState, dispatch: (action: CloudBackupAction) => void): HTMLElement {
  const { section, body } = createCollapsibleImportExportSection(
    'image-trail-panel__cloud-backup',
    'Cloud backup',
    cloudBackupOpen,
    (open) => {
      cloudBackupOpen = open;
    },
  );

  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection image-trail-panel__cloud-provider';

  const heading = document.createElement('div');
  heading.className = 'image-trail-panel__cloud-provider-heading';

  const title = document.createElement('h4');
  title.textContent = 'pCloud';

  const status = document.createElement('span');
  status.className = `image-trail-panel__cloud-provider-status is-${state.connectionState}`;
  status.textContent = cloudConnectionLabel(state);
  status.title = status.textContent;

  heading.append(title, status);
  group.append(heading);

  const description = document.createElement('p');
  description.className = 'image-trail-panel__meta';
  description.textContent = 'Manual encrypted backups use Image Trail export files stored in pCloud.';
  group.append(description);

  if (state.message) {
    const message = document.createElement('p');
    message.className = state.messageIsError ? 'image-trail-panel__meta image-trail-panel__error' : 'image-trail-panel__meta';
    if (state.messageIsError) message.setAttribute('role', 'alert');
    message.textContent = state.message;
    group.append(message);
  }

  const metadata = cloudBackupMetadata(state);
  if (metadata.length > 0) group.append(createCloudBackupMetadata(metadata));

  const connectBtn = createCloudBackupButton('Connect pCloud', state, () => dispatch({ name: 'cloud-backup/connect', provider: 'pcloud' }));
  connectBtn.disabled = state.connectionState !== 'disconnected';

  const backupBtn = createCloudBackupButton('Back up now', state, () => dispatch({ name: 'cloud-backup/backup-now', provider: 'pcloud' }));
  backupBtn.classList.add('image-trail-panel__primary-action');
  backupBtn.disabled = state.connectionState !== 'connected';

  const restoreBtn = createCloudBackupButton('Choose restore file', state, () =>
    dispatch({ name: 'cloud-backup/choose-restore', provider: 'pcloud' }),
  );
  restoreBtn.disabled = state.connectionState !== 'connected';

  const retryBtn = createCloudBackupButton('Retry pCloud', state, () => dispatch({ name: 'cloud-backup/retry', provider: 'pcloud' }));
  retryBtn.disabled = state.connectionState !== 'error';

  const disconnectBtn = createCloudBackupButton('Disconnect', state, () =>
    dispatch({ name: 'cloud-backup/disconnect', provider: 'pcloud' }),
  );
  disconnectBtn.classList.add('image-trail-panel__secondary-action');
  disconnectBtn.disabled = state.connectionState !== 'connected';

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__action-groups';
  actions.append(
    createActionGroup('Provider', [connectBtn, retryBtn]),
    createActionGroup('Manual backup', [backupBtn, restoreBtn]),
    createActionGroup('Account', [disconnectBtn], { secondary: true }),
  );

  group.append(actions);
  body.append(group);
  return section;
}

function createCollapsibleImportExportSection(
  className: string,
  title: string,
  open: boolean,
  onToggle: (open: boolean) => void,
): { readonly section: HTMLDetailsElement; readonly body: HTMLDivElement } {
  const section = document.createElement('details');
  section.className = `image-trail-panel__settings-templates image-trail-panel__settings-utility-section ${className}`;
  section.open = open;
  section.addEventListener('toggle', () => {
    onToggle(section.open);
  });

  const heading = document.createElement('h4');
  heading.textContent = title;

  const header = document.createElement('div');
  header.className = 'image-trail-panel__settings-utility-header';
  header.append(heading);

  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__settings-utility-summary';
  summary.append(header);

  const body = document.createElement('div');
  body.className = 'image-trail-panel__settings-utility-body';

  section.append(summary, body);
  return { section, body };
}

function createExportGroup(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection';

  const label = document.createElement('h4');
  label.textContent = 'Export';
  group.append(label);

  const passwordControl = createPasswordField({
    label: 'Encrypted export password',
    description: 'Protects exported history and bookmark JSON files unless plaintext export is enabled.',
    placeholder: 'Export password',
    autocomplete: 'new-password',
    disabled: state.busy,
  });
  const passwordInput = passwordControl.input;

  const plaintext = createToggle('Plaintext');

  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__control-stack';
  controls.append(passwordControl.field, plaintext.label);

  const historyBtn = document.createElement('button');
  historyBtn.type = 'button';
  historyBtn.textContent = state.selectedHistoryCount > 0 ? `Export selected history (${state.selectedHistoryCount})` : 'Export history';
  historyBtn.classList.toggle('is-waiting', state.busy);
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
  bookmarksBtn.classList.toggle('is-waiting', state.busy);
  bookmarksBtn.disabled = state.busy;
  bookmarksBtn.addEventListener('click', () => {
    dispatch({ name: 'export/bookmarks', password: passwordInput.value, plaintext: plaintext.input.checked });
    passwordInput.value = '';
    updateExportControls();
  });

  const urlReviewStatusBtn = document.createElement('button');
  urlReviewStatusBtn.type = 'button';
  urlReviewStatusBtn.textContent = 'Export URL review status';
  urlReviewStatusBtn.classList.toggle('is-waiting', state.busy);
  urlReviewStatusBtn.disabled = state.busy;
  urlReviewStatusBtn.addEventListener('click', () => dispatch({ name: 'export/url-review-status' }));

  const clearSiteBtn = createUrlReviewClearButton('Clear current site', 'hostname', state, dispatch);
  const clearPageBtn = createUrlReviewClearButton('Clear current page', 'page', state, dispatch);
  const clearUrlBtn = createUrlReviewClearButton('Clear selected URL', 'source', state, dispatch);
  const clearAllBtn = createUrlReviewClearButton('Clear all review status', 'all', state, dispatch);

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__action-groups';
  actions.append(
    createActionGroup('Export records', [historyBtn, bookmarksBtn, urlReviewStatusBtn]),
    createActionGroup('Clear review status', [clearSiteBtn, clearPageBtn, clearUrlBtn, clearAllBtn], { secondary: true }),
  );

  const updateExportControls = (): void => {
    const locked = state.busy || (!plaintext.input.checked && passwordInput.value.length < 4);
    historyBtn.disabled = locked;
    bookmarksBtn.disabled = locked;
    urlReviewStatusBtn.disabled = state.busy;
    clearSiteBtn.disabled = state.busy;
    clearPageBtn.disabled = state.busy;
    clearUrlBtn.disabled = state.busy;
    clearAllBtn.disabled = state.busy;
    passwordInput.disabled = plaintext.input.checked || state.busy;
  };
  passwordInput.addEventListener('input', updateExportControls);
  plaintext.input.addEventListener('change', updateExportControls);
  updateExportControls();

  group.append(controls, actions);
  return group;
}

function createUrlReviewClearButton(
  label: string,
  scope: UrlReviewStatusClearScope,
  state: ImportExportViewState,
  dispatch: (action: ImportExportAction) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = state.busy;
  button.className = 'image-trail-panel__secondary-action';
  button.addEventListener('click', () => dispatch({ name: 'clear/url-review-status', scope }));
  return button;
}

function createImageGroup(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection';

  const imageControl = createFilePickerField({
    label: 'Image files',
    description: 'Choose one or more local image files to import into the active session.',
    buttonText: 'Choose images',
    noFileText: 'No file selected',
    accept: 'image/*',
    multiple: true,
    disabled: state.busy,
  });
  const imageInput = imageControl.input;

  const encryptedImageControl = createFilePickerField({
    label: 'Encrypted image files',
    description: 'Choose Image Trail encrypted image JSON files to import after encrypted storage is unlocked.',
    buttonText: 'Choose encrypted',
    noFileText: 'No file selected',
    accept: '.json,.image-trail-encrypted.json',
    multiple: true,
    disabled: state.busy || !state.blobKeyUnlocked,
  });
  const encryptedImageInput = encryptedImageControl.input;

  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__control-stack';
  controls.append(imageControl.field, encryptedImageControl.field);

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.textContent = 'Import selected';
  importBtn.classList.toggle('is-waiting', state.busy);
  importBtn.disabled = state.busy;
  importBtn.addEventListener('click', () => {
    readImageFiles(imageInput, (files) => dispatch({ name: 'import/image', files }));
  });

  const importEncryptedBtn = document.createElement('button');
  importEncryptedBtn.type = 'button';
  importEncryptedBtn.textContent = 'Import encrypted';
  importEncryptedBtn.classList.toggle('is-waiting', state.busy);
  importEncryptedBtn.disabled = state.busy || !state.blobKeyUnlocked;
  importEncryptedBtn.addEventListener('click', () => {
    readEncryptedImageFiles(encryptedImageInput, (files) => dispatch({ name: 'import/encrypted-image', files }));
  });

  const selectEverythingBtn = document.createElement('button');
  selectEverythingBtn.type = 'button';
  selectEverythingBtn.textContent = 'Select everything shown';
  selectEverythingBtn.classList.toggle('is-waiting', state.busy);
  selectEverythingBtn.disabled = state.busy || state.visibleImageSelectionCount === 0;
  selectEverythingBtn.addEventListener('click', () => dispatch({ name: 'selection/select-visible' }));

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.textContent = state.selectedImageDownloadCount > 0 ? `Export images (${state.selectedImageDownloadCount})` : 'Export images';
  exportBtn.classList.toggle('is-waiting', state.busy);
  exportBtn.disabled = state.busy || !state.imageDownloadAvailable;
  exportBtn.addEventListener('click', (event) => {
    dispatch({ name: 'export/image', saveAs: event.shiftKey });
  });

  const exportEncryptedBtn = document.createElement('button');
  exportEncryptedBtn.type = 'button';
  exportEncryptedBtn.textContent =
    state.selectedImageDownloadCount > 0 ? `Export encrypted (${state.selectedImageDownloadCount})` : 'Export encrypted';
  exportEncryptedBtn.classList.toggle('is-waiting', state.busy);
  exportEncryptedBtn.disabled = state.busy || !state.encryptedImageTransferAvailable;
  exportEncryptedBtn.addEventListener('click', () => {
    dispatch({ name: 'export/encrypted-image' });
  });

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__action-groups';
  actions.append(
    createActionGroup('Import files', [importBtn, importEncryptedBtn]),
    createActionGroup('Image downloads', [selectEverythingBtn, exportBtn, exportEncryptedBtn]),
  );

  group.append(controls, actions);
  return group;
}

function createImportGroup(state: ImportExportViewState, dispatch: (action: ImportExportAction) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__subsection';

  const label = document.createElement('h4');
  label.textContent = 'Import';
  group.append(label);

  const passwordControl = createPasswordField({
    label: 'Encrypted import password',
    description: 'Unlocks encrypted history or bookmark import files. Plain URL review and legacy imports ignore this password.',
    placeholder: 'Import password',
    autocomplete: 'current-password',
    disabled: state.busy,
  });
  const passwordInput = passwordControl.input;

  const fileControl = createFilePickerField({
    label: 'Import JSON file',
    description: 'Choose an Image Trail history, bookmark, URL review status, or legacy bookmarklet JSON file.',
    buttonText: 'Choose JSON',
    noFileText: 'No file selected',
    accept: '.json',
    disabled: state.busy,
  });
  const fileInput = fileControl.input;

  const historyBtn = document.createElement('button');
  historyBtn.type = 'button';
  historyBtn.textContent = 'Import history';
  historyBtn.classList.toggle('is-waiting', state.busy);
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
  bookmarksBtn.classList.toggle('is-waiting', state.busy);
  bookmarksBtn.disabled = state.busy;
  bookmarksBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      dispatch({ name: 'import/bookmarks', fileContent: content, password: passwordInput.value });
      passwordInput.value = '';
    });
  });

  const urlReviewStatusBtn = document.createElement('button');
  urlReviewStatusBtn.type = 'button';
  urlReviewStatusBtn.textContent = 'Import URL review status';
  urlReviewStatusBtn.classList.toggle('is-waiting', state.busy);
  urlReviewStatusBtn.disabled = state.busy;
  urlReviewStatusBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      dispatch({ name: 'import/url-review-status', fileContent: content });
    });
  });

  const bookmarkletBtn = document.createElement('button');
  bookmarkletBtn.type = 'button';
  bookmarkletBtn.textContent = 'Import legacy bookmarklet JSON';
  bookmarkletBtn.className = 'image-trail-panel__secondary-action';
  bookmarkletBtn.classList.toggle('is-waiting', state.busy);
  bookmarkletBtn.disabled = state.busy;
  bookmarkletBtn.addEventListener('click', () => {
    readFileInput(fileInput, (content) => {
      dispatch({ name: 'import/bookmarklet', fileContent: content });
    });
  });

  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__control-stack';
  controls.append(fileControl.field, passwordControl.field);

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__action-groups';
  actions.append(
    createActionGroup('Import records', [historyBtn, bookmarksBtn, urlReviewStatusBtn]),
    createAdvancedActionGroup('Advanced import', createActionGroup('Legacy migration', [bookmarkletBtn], { secondary: true })),
  );

  group.append(controls, actions);
  return group;
}

function createAdvancedActionGroup(label: string, content: HTMLElement): HTMLElement {
  const details = document.createElement('details');
  details.className = 'image-trail-panel__advanced-action-group';

  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__advanced-action-summary';
  summary.textContent = label;

  details.append(summary, content);
  return details;
}

function createCloudBackupButton(label: string, state: CloudBackupProviderState, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = state.pendingOperation ? cloudPendingLabel(label, state.pendingOperation) : label;
  button.classList.toggle('is-waiting', state.connectionState === 'busy');
  button.disabled = state.connectionState === 'busy';
  button.addEventListener('click', onClick);
  return button;
}

function cloudConnectionLabel(state: CloudBackupProviderState): string {
  if (state.connectionState === 'busy' && state.pendingOperation === 'connecting') return 'Connecting';
  if (state.connectionState === 'busy' && state.pendingOperation === 'backing-up') return 'Backing up';
  if (state.connectionState === 'busy' && state.pendingOperation === 'restoring') return 'Checking restore';
  if (state.connectionState === 'connected') return 'Connected';
  if (state.connectionState === 'error') return 'Needs attention';
  return 'Not connected';
}

function cloudPendingLabel(label: string, operation: NonNullable<CloudBackupProviderState['pendingOperation']>): string {
  if (operation === 'connecting' && label === 'Connect pCloud') return 'Connecting...';
  if (operation === 'backing-up' && label === 'Back up now') return 'Backing up...';
  if (operation === 'restoring' && label === 'Choose restore file') return 'Checking restore...';
  return label;
}

function cloudBackupMetadata(state: CloudBackupProviderState): ReadonlyArray<readonly [string, string]> {
  const rows: Array<readonly [string, string]> = [];
  if (state.apiHost) rows.push(['API host', state.apiHost]);
  if (state.folderPath) rows.push(['Folder', state.folderPath]);
  if (state.lastBackupAt) rows.push(['Last backup', state.lastBackupAt]);
  if (state.lastBackupSize) rows.push(['Size', state.lastBackupSize]);
  if (state.lastBackupSha256) rows.push(['SHA-256', state.lastBackupSha256]);
  if (state.restoreCandidateName) rows.push(['Restore file', state.restoreCandidateName]);
  if (state.restoreCandidateSize) rows.push(['Restore size', state.restoreCandidateSize]);
  return rows;
}

function createCloudBackupMetadata(rows: ReadonlyArray<readonly [string, string]>): HTMLElement {
  const list = document.createElement('dl');
  list.className = 'image-trail-panel__cloud-provider-metadata';
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    detail.title = value;
    list.append(term, detail);
  }
  return list;
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
