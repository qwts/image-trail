export function createActionGroup(
  label: string,
  buttons: readonly HTMLButtonElement[],
  options: { readonly secondary?: boolean } = {},
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'image-trail-panel__action-group image-trail-ds__settings-action-group';
  if (options.secondary) group.classList.add('is-secondary');

  const title = document.createElement('p');
  title.className = 'image-trail-panel__action-group-title image-trail-ds__settings-caption';
  title.textContent = label;

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  actions.append(...buttons);

  group.append(title, actions);
  return group;
}
