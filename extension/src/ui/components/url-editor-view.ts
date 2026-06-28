import { PRIVACY_URL_TEXT } from './record-metadata.js';

export interface UrlEditorViewState {
  readonly url: string | null;
  readonly isDataUrl?: boolean;
  readonly privacyMode?: boolean;
}

export interface UrlEditorViewCallbacks {
  readonly onApply: (url: string) => void;
  readonly onRejectUnsupportedInput?: () => void;
}

const EMPTY_URL_MESSAGE = 'Select a target image to inspect its URL.';

export function isUnsupportedUrlEditorInput(url: string): boolean {
  return url.trim().toLowerCase().startsWith('data:');
}

export function createUrlEditorView(state: UrlEditorViewState, callbacks: UrlEditorViewCallbacks): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'image-trail-panel__section image-trail-panel__url-editor';

  const heading = document.createElement('h3');
  heading.textContent = 'URL editor';

  const value = document.createElement('textarea');
  value.className = 'image-trail-panel__full-url-input';
  if (state.privacyMode && state.url) value.classList.add('is-privacy-masked');
  value.rows = state.isDataUrl ? 1 : 4;
  value.wrap = 'soft';
  value.spellcheck = false;
  value.disabled = state.url === null || state.isDataUrl === true;
  value.readOnly = state.privacyMode === true;
  value.value = state.privacyMode && state.url ? PRIVACY_URL_TEXT : state.isDataUrl ? 'data URL' : (state.url ?? '');
  value.title = state.privacyMode && state.url ? 'Privacy mode is hiding this URL for screen sharing.' : (state.url ?? EMPTY_URL_MESSAGE);
  value.placeholder = EMPTY_URL_MESSAGE;

  const applyUrl = (): void => {
    if (state.isDataUrl) return;
    callbacks.onApply(state.privacyMode ? (state.url ?? '') : value.value);
  };

  value.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyUrl();
    }
  });

  value.addEventListener('paste', (event) => {
    const pastedText = event.clipboardData?.getData('text/plain') ?? '';
    if (!isUnsupportedUrlEditorInput(pastedText)) return;

    event.preventDefault();
    callbacks.onRejectUnsupportedInput?.();
  });

  wrapper.append(heading, value);
  return wrapper;
}
