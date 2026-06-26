let formControlId = 0;

interface PasswordControlOptions {
  readonly label: string;
  readonly description: string;
  readonly placeholder: string;
  readonly autocomplete: HTMLInputElement['autocomplete'];
  readonly disabled?: boolean;
}

interface FilePickerOptions {
  readonly label: string;
  readonly description: string;
  readonly buttonText: string;
  readonly noFileText: string;
  readonly accept: string;
  readonly multiple?: boolean;
  readonly disabled?: boolean;
}

function nextFormControlId(prefix: string): string {
  formControlId += 1;
  return `image-trail-${prefix}-${formControlId}`;
}

function createFieldDescription(id: string, text: string): HTMLParagraphElement {
  const description = document.createElement('p');
  description.id = id;
  description.className = 'image-trail-panel__form-field-help';
  description.textContent = text;
  return description;
}

export function createPasswordField(options: PasswordControlOptions): {
  readonly field: HTMLElement;
  readonly input: HTMLInputElement;
} {
  const id = nextFormControlId('password');
  const descriptionId = `${id}-description`;

  const field = document.createElement('div');
  field.className = 'image-trail-panel__form-field';

  const label = document.createElement('label');
  label.className = 'image-trail-panel__form-field-label';
  label.htmlFor = id;
  label.textContent = options.label;

  const input = document.createElement('input');
  input.id = id;
  input.type = 'password';
  input.placeholder = options.placeholder;
  input.autocomplete = options.autocomplete;
  input.className = 'image-trail-panel__password-input';
  input.disabled = options.disabled === true;
  input.setAttribute('aria-describedby', descriptionId);

  field.append(label, input, createFieldDescription(descriptionId, options.description));
  return { field, input };
}

export function createFilePickerField(options: FilePickerOptions): {
  readonly field: HTMLElement;
  readonly input: HTMLInputElement;
} {
  const id = nextFormControlId('file');
  const labelId = `${id}-label`;
  const buttonId = `${id}-button`;
  const descriptionId = `${id}-description`;
  const selectedId = `${id}-selected`;

  const field = document.createElement('div');
  field.className = 'image-trail-panel__form-field';

  const fieldLabel = document.createElement('span');
  fieldLabel.id = labelId;
  fieldLabel.className = 'image-trail-panel__form-field-label';
  fieldLabel.textContent = options.label;

  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__file-picker';

  const input = document.createElement('input');
  input.id = id;
  input.type = 'file';
  input.accept = options.accept;
  input.multiple = options.multiple === true;
  input.className = 'image-trail-panel__file-input';
  input.disabled = options.disabled === true;
  input.setAttribute('aria-labelledby', `${labelId} ${buttonId}`);
  input.setAttribute('aria-describedby', `${descriptionId} ${selectedId}`);

  const buttonLabel = document.createElement('label');
  buttonLabel.id = buttonId;
  buttonLabel.className = 'image-trail-panel__file-picker-button';
  buttonLabel.htmlFor = id;
  buttonLabel.textContent = options.buttonText;

  const selectedName = document.createElement('span');
  selectedName.id = selectedId;
  selectedName.className = 'image-trail-panel__file-picker-name';
  selectedName.textContent = options.noFileText;
  selectedName.setAttribute('aria-live', 'polite');

  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    selectedName.textContent = files.length > 1 ? `${files.length} files selected` : (files[0]?.name ?? options.noFileText);
  });

  wrapper.append(input, buttonLabel, selectedName);
  field.append(fieldLabel, wrapper, createFieldDescription(descriptionId, options.description));
  return { field, input };
}
