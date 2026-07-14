import { PRIVACY_URL_TEXT } from './record-metadata.js';
import { createButton, createInput, createKbd, createSectionHeader } from './primitives.js';

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
  wrapper.className = 'image-trail-panel__section image-trail-panel__url-editor image-trail-ds__url-editor';

  const heading = createSectionHeader({ title: 'URL editor', className: 'image-trail-panel__section-header', divider: false });
  const privacyMasked = state.privacyMode === true && state.url !== null;
  const value = privacyMasked
    ? createInput({
        ariaLabel: 'Full image URL',
        multiline: true,
        privacyMasked: true,
        maskedPlaceholder: PRIVACY_URL_TEXT,
        rows: state.isDataUrl ? 1 : 4,
        wrap: 'soft',
        spellcheck: false,
        disabled: state.url === null || state.isDataUrl === true,
        readOnly: true,
        className: 'image-trail-panel__full-url-input',
      })
    : createInput({
        ariaLabel: 'Full image URL',
        multiline: true,
        value: state.isDataUrl ? 'data URL' : (state.url ?? ''),
        rows: state.isDataUrl ? 1 : 4,
        wrap: 'soft',
        spellcheck: false,
        disabled: state.url === null || state.isDataUrl === true,
        readOnly: false,
        placeholder: EMPTY_URL_MESSAGE,
        className: 'image-trail-panel__full-url-input',
      });
  if (privacyMasked) value.value = PRIVACY_URL_TEXT;
  value.title = state.privacyMode && state.url ? 'Privacy mode is hiding this URL for screen sharing.' : (state.url ?? EMPTY_URL_MESSAGE);

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

  const footer = document.createElement('div');
  footer.className = 'image-trail-panel__url-editor-footer';
  const hint = document.createElement('span');
  hint.className = 'image-trail-panel__url-editor-hint';
  hint.append(createKbd('Enter'), document.createTextNode(' apply URL'));
  const apply = createButton({
    label: 'Apply URL',
    variant: 'primary',
    disabled: state.url === null || state.isDataUrl === true,
    onClick: applyUrl,
  });
  footer.append(hint, apply);
  wrapper.append(heading, value, footer);
  return wrapper;
}
