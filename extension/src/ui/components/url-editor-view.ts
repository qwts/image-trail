export interface UrlEditorViewState {
  readonly url: string | null;
  readonly isDataUrl?: boolean;
}

export interface UrlEditorViewCallbacks {
  readonly onApply: (url: string) => void;
}

const EMPTY_URL_MESSAGE = 'Select a target image to inspect its URL.';

export function createUrlEditorView(state: UrlEditorViewState, callbacks: UrlEditorViewCallbacks): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'image-trail-panel__section image-trail-panel__url-editor';

  const heading = document.createElement('h3');
  heading.textContent = 'URL editor';

  const value = document.createElement('textarea');
  value.className = 'image-trail-panel__full-url-input';
  value.rows = state.isDataUrl ? 1 : 4;
  value.wrap = 'soft';
  value.spellcheck = false;
  value.disabled = state.url === null || state.isDataUrl === true;
  value.value = state.isDataUrl ? 'data URL' : (state.url ?? '');
  value.placeholder = EMPTY_URL_MESSAGE;

  const applyUrl = (): void => {
    if (state.isDataUrl) return;
    callbacks.onApply(value.value);
  };

  value.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyUrl();
    }
  });

  wrapper.append(heading, value);
  return wrapper;
}
