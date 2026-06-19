export interface UrlEditorViewState {
  readonly url: string | null;
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
  value.rows = 4;
  value.wrap = 'soft';
  value.spellcheck = false;
  value.disabled = state.url === null;
  value.value = state.url ?? '';
  value.placeholder = EMPTY_URL_MESSAGE;

  const applyUrl = (): void => {
    callbacks.onApply(value.value);
  };

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';

  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply URL';
  apply.disabled = state.url === null;
  apply.addEventListener('click', applyUrl);

  value.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      applyUrl();
    }
  });

  actions.append(apply);
  wrapper.append(heading, value, actions);
  return wrapper;
}
