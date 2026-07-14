import { DOWN_ARROW_ACTION_OPTIONS, isDownArrowAction, type DownArrowAction } from '../../core/keyboard-shortcuts.js';
import type { PanelAction } from '../../core/types.js';
import { createKbd, createSelect } from './primitives.js';

export function createKeybindingSettingsView(downArrowAction: DownArrowAction, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates image-trail-panel__keybinding-settings';

  const heading = document.createElement('h4');
  heading.textContent = 'Keybindings';

  const note = document.createElement('p');
  note.className = 'image-trail-panel__settings-empty';
  note.append(
    document.createTextNode('The '),
    createKbd('C'),
    document.createTextNode(
      " key captures the current image. The Down arrow is yours to assign — pick what it fires below. Modifier shortcuts like Grab Mode and Slideshow are set in your browser's extension keyboard shortcuts page.",
    ),
  );

  const field = document.createElement('label');
  field.className = 'image-trail-panel__settings-field image-trail-panel__settings-field--wide';
  const label = document.createElement('span');
  label.className = 'image-trail-ds__settings-label';
  label.textContent = 'Down arrow ( ↓ )';
  const select = createSelect({
    ariaLabel: 'Down arrow action',
    value: downArrowAction,
    items: DOWN_ARROW_ACTION_OPTIONS,
    onChange: (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (isDownArrowAction(value)) dispatch({ name: 'settings/update-down-arrow-action', value });
    },
  });
  field.append(label, select);
  wrapper.append(heading, note, field);
  return wrapper;
}
