export interface FieldsResetControlsOptions {
  readonly privacyMode: boolean;
  readonly resetAllAvailable: boolean;
  readonly resetStructureAvailable: boolean;
  readonly onResetStructure: () => void;
  readonly onResetAll: () => void;
}

export function createFieldsResetControls(options: FieldsResetControlsOptions): HTMLSpanElement | null {
  if (!options.resetAllAvailable && !options.resetStructureAvailable) return null;

  const controls = document.createElement('span');
  controls.className = 'image-trail-panel__fields-reset-controls';
  if (options.resetStructureAvailable) {
    controls.append(
      createResetButton(
        'Reset structure',
        options.privacyMode ? 'Reset private parsed field structure' : 'Reset parsed field structure',
        options.onResetStructure,
      ),
    );
  }
  if (options.resetAllAvailable) {
    controls.append(
      createResetButton('Reset all', options.privacyMode ? 'Reset private parsed fields' : 'Reset all parsed fields', options.onResetAll),
    );
  }
  return controls;
}

function createResetButton(label: string, title: string, onReset: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-trail-panel__fields-reset-all';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    onReset();
  });
  return button;
}
