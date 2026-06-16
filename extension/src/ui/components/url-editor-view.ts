export interface UrlEditorViewState {
  readonly url: string | null;
}

export function createUrlEditorView(state: UrlEditorViewState): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'image-trail-panel__section image-trail-panel__url-editor';
  const heading = document.createElement('h3');
  heading.textContent = 'URL editor';
  const value = document.createElement('p');
  value.className = 'image-trail-panel__target-url';
  value.textContent = state.url ?? 'Select a target image to inspect its URL.';
  wrapper.append(heading, value);
  return wrapper;
}
