export type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost' | 'danger';
export type BadgeTone = 'neutral' | 'selected' | 'encryption' | 'count' | 'success' | 'warning' | 'error';
export type StatusTone = 'ready' | 'connected' | 'busy' | 'success' | 'warning' | 'error' | 'neutral';
export type ToastTone = 'ready' | 'success' | 'warning' | 'error';
export type CardTone = 'default' | 'encryption' | 'danger';

export interface PrimitiveOptions {
  readonly id?: string;
  readonly className?: string;
  readonly title?: string;
}

type AccessibleName =
  { readonly ariaLabel: string; readonly ariaLabelledBy?: never } | { readonly ariaLabel?: never; readonly ariaLabelledBy: string };

type PrimitiveContent = string | Node | readonly Node[];

type ButtonContent =
  | { readonly label: string; readonly content?: never; readonly ariaLabel?: string }
  | { readonly label?: never; readonly content: Node | readonly Node[]; readonly ariaLabel: string };

export type ButtonOptions = PrimitiveOptions &
  ButtonContent & {
    readonly variant?: ButtonVariant;
    readonly active?: boolean;
    readonly pressed?: boolean;
    readonly waiting?: boolean;
    readonly disabled?: boolean;
    readonly fullWidth?: boolean;
    readonly onClick?: (event: MouseEvent) => void;
  };

export interface IconButtonOptions extends PrimitiveOptions {
  readonly glyph: string;
  readonly label: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: (event: MouseEvent) => void;
}

interface InputSharedOptions extends PrimitiveOptions {
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly invalid?: boolean;
  readonly spellcheck?: boolean;
  readonly describedBy?: string;
  readonly onInput?: (event: Event) => void;
  readonly onChange?: (event: Event) => void;
}

type VisibleInputValue = {
  readonly privacyMasked?: false;
  readonly value?: string;
  readonly placeholder?: string;
  readonly maskedPlaceholder?: never;
};

type PrivateInputValue = {
  readonly privacyMasked: true;
  readonly value?: never;
  readonly placeholder?: never;
  readonly maskedPlaceholder?: string;
};

export type SingleLineInputOptions = InputSharedOptions &
  AccessibleName &
  (VisibleInputValue | PrivateInputValue) & {
    readonly multiline?: false;
    readonly type?: 'text' | 'url' | 'password' | 'search' | 'number';
    readonly autocomplete?: HTMLInputElement['autocomplete'];
  };

export type TextareaInputOptions = InputSharedOptions &
  AccessibleName &
  (VisibleInputValue | PrivateInputValue) & {
    readonly multiline: true;
    readonly rows?: number;
    readonly wrap?: HTMLTextAreaElement['wrap'];
  };

export type InputOptions = SingleLineInputOptions | TextareaInputOptions;

export interface SelectItem {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type SelectOptions = PrimitiveOptions &
  AccessibleName & {
    readonly items: readonly SelectItem[];
    readonly value?: string;
    readonly disabled?: boolean;
    readonly required?: boolean;
    readonly invalid?: boolean;
    readonly describedBy?: string;
    readonly onChange?: (event: Event) => void;
  };

export interface ToggleOptions extends PrimitiveOptions {
  readonly label: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly describedBy?: string;
  readonly onChange?: (event: Event) => void;
}

export interface BadgeOptions extends PrimitiveOptions {
  readonly label: string;
  readonly tone?: BadgeTone;
  readonly uppercase?: boolean;
}

export interface StatusPillOptions extends PrimitiveOptions {
  readonly label: string;
  readonly tone?: StatusTone;
  readonly waiting?: boolean;
}

type ToastMessage =
  | { readonly privacyMasked?: false; readonly message: string; readonly privateMessage?: never }
  | { readonly privacyMasked: true; readonly message?: never; readonly privateMessage?: string };

export type ToastOptions = PrimitiveOptions &
  ToastMessage & {
    readonly label?: string;
    readonly tone?: ToastTone;
    readonly waiting?: boolean;
  };

export interface CardOptions extends PrimitiveOptions {
  readonly children: PrimitiveContent;
  readonly tone?: CardTone;
  readonly ariaLabel?: string;
}

export interface SectionHeaderOptions extends PrimitiveOptions {
  readonly title: string;
  readonly actions?: readonly HTMLElement[];
  readonly headingLevel?: 2 | 3 | 4;
  readonly collapsible?: boolean;
  readonly open?: boolean;
  readonly onToggle?: (event: MouseEvent) => void;
  readonly detachable?: boolean;
  readonly onDetach?: (event: MouseEvent) => void;
  readonly divider?: boolean;
}

function configureElement(element: HTMLElement, options: PrimitiveOptions): void {
  if (options.id) element.id = options.id;
  if (options.title) element.title = options.title;
  if (options.className) {
    element.classList.add(...options.className.split(/\s+/u).filter(Boolean));
  }
}

function applyAccessibleName(element: HTMLElement, options: AccessibleName): void {
  if ('ariaLabel' in options && options.ariaLabel !== undefined) element.setAttribute('aria-label', options.ariaLabel);
  else if (options.ariaLabelledBy) element.setAttribute('aria-labelledby', options.ariaLabelledBy);
}

function appendContent(element: HTMLElement, content: PrimitiveContent): void {
  if (typeof content === 'string') element.textContent = content;
  else if (Array.isArray(content)) element.append(...content);
  else element.append(content as Node);
}

export function createButton(options: ButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-trail-ds__button';
  button.dataset['variant'] = options.variant ?? 'default';
  button.disabled = options.disabled === true;
  button.classList.toggle('is-active', options.active === true || options.pressed === true);
  button.classList.toggle('is-waiting', options.waiting === true);
  button.classList.toggle('is-full-width', options.fullWidth === true);
  if (options.pressed !== undefined) button.setAttribute('aria-pressed', String(options.pressed));
  if (options.waiting) button.setAttribute('aria-busy', 'true');
  if (options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
  if (options.label !== undefined) button.textContent = options.label;
  else appendContent(button, options.content);
  if (options.onClick) button.addEventListener('click', options.onClick);
  configureElement(button, options);
  return button;
}

export function createIconButton(options: IconButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-trail-ds__icon-button';
  button.textContent = options.glyph;
  button.disabled = options.disabled === true;
  button.setAttribute('aria-label', options.label);
  button.title = options.title ?? options.label;
  if (options.pressed !== undefined) button.setAttribute('aria-pressed', String(options.pressed));
  if (options.onClick) button.addEventListener('click', options.onClick);
  configureElement(button, options);
  return button;
}

export function createInput(options: SingleLineInputOptions): HTMLInputElement;
export function createInput(options: TextareaInputOptions): HTMLTextAreaElement;
export function createInput(options: InputOptions): HTMLInputElement | HTMLTextAreaElement {
  let input: HTMLInputElement | HTMLTextAreaElement;
  if (options.multiline) {
    const textarea = document.createElement('textarea');
    textarea.rows = options.rows ?? 3;
    if (options.wrap) textarea.wrap = options.wrap;
    input = textarea;
  } else {
    const singleLine = document.createElement('input');
    singleLine.type = options.type ?? 'text';
    if (options.autocomplete) singleLine.autocomplete = options.autocomplete;
    input = singleLine;
  }
  input.className = 'image-trail-ds__input';
  input.disabled = options.disabled === true;
  input.readOnly = options.readOnly === true;
  input.required = options.required === true;
  if (options.spellcheck !== undefined) input.spellcheck = options.spellcheck;
  input.setAttribute('aria-invalid', String(options.invalid === true));
  input.classList.toggle('is-private', options.privacyMasked === true);
  if (options.describedBy) input.setAttribute('aria-describedby', options.describedBy);
  applyAccessibleName(input, options);
  if (options.privacyMasked) {
    input.value = '';
    input.placeholder = options.maskedPlaceholder ?? 'Private value hidden';
  } else {
    input.value = options.value ?? '';
    input.placeholder = options.placeholder ?? '';
  }
  if (options.onInput) input.addEventListener('input', options.onInput);
  if (options.onChange) input.addEventListener('change', options.onChange);
  configureElement(input, options);
  return input;
}

export function createSelect(options: SelectOptions): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'image-trail-ds__select';
  select.disabled = options.disabled === true;
  select.required = options.required === true;
  select.setAttribute('aria-invalid', String(options.invalid === true));
  if (options.describedBy) select.setAttribute('aria-describedby', options.describedBy);
  applyAccessibleName(select, options);
  for (const item of options.items) {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    option.disabled = item.disabled === true;
    select.append(option);
  }
  if (options.value !== undefined) select.value = options.value;
  if (options.onChange) select.addEventListener('change', options.onChange);
  configureElement(select, options);
  return select;
}

export function createToggle(options: ToggleOptions): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'image-trail-ds__toggle';
  field.classList.toggle('is-disabled', options.disabled === true);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = options.checked === true;
  input.disabled = options.disabled === true;
  if (options.describedBy) input.setAttribute('aria-describedby', options.describedBy);
  if (options.onChange) input.addEventListener('change', options.onChange);
  const label = document.createElement('span');
  label.textContent = options.label;
  field.append(input, label);
  configureElement(field, options);
  return field;
}

export function createBadge(options: BadgeOptions): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = 'image-trail-ds__badge';
  badge.dataset['tone'] = options.tone ?? 'neutral';
  badge.classList.toggle('is-uppercase', options.uppercase === true);
  badge.textContent = options.label;
  configureElement(badge, options);
  return badge;
}

export function createStatusPill(options: StatusPillOptions): HTMLSpanElement {
  const pill = document.createElement('span');
  pill.className = 'image-trail-ds__status-pill';
  pill.dataset['tone'] = options.tone ?? 'ready';
  pill.classList.toggle('is-waiting', options.waiting === true);
  pill.textContent = options.label;
  pill.setAttribute('role', 'status');
  if (options.waiting) {
    pill.setAttribute('aria-busy', 'true');
    pill.setAttribute('aria-live', 'polite');
  }
  configureElement(pill, options);
  return pill;
}

export function createKbd(keys: string, options: PrimitiveOptions = {}): HTMLElement {
  const kbd = document.createElement('kbd');
  kbd.className = 'image-trail-ds__kbd';
  kbd.textContent = keys;
  configureElement(kbd, options);
  return kbd;
}

export function createToast(options: ToastOptions): HTMLElement {
  const toast = document.createElement('aside');
  const tone = options.tone ?? 'ready';
  toast.className = 'image-trail-ds__toast';
  toast.dataset['tone'] = tone;
  toast.classList.toggle('is-waiting', options.waiting === true);
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
  if (options.waiting) toast.setAttribute('aria-busy', 'true');
  const label = document.createElement('span');
  label.className = 'image-trail-ds__toast-label';
  label.textContent = options.label ?? (tone === 'error' ? 'Error' : options.waiting ? 'Working' : tone);
  const message = document.createElement('span');
  message.className = 'image-trail-ds__toast-message';
  message.textContent = options.privacyMasked ? (options.privateMessage ?? 'Image Trail needs attention.') : options.message;
  toast.append(label, message);
  configureElement(toast, options);
  return toast;
}

export function createCard(options: CardOptions): HTMLElement {
  const card = document.createElement('div');
  card.className = 'image-trail-ds__card';
  card.dataset['tone'] = options.tone ?? 'default';
  if (options.ariaLabel) {
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', options.ariaLabel);
  }
  appendContent(card, options.children);
  configureElement(card, options);
  return card;
}

export function createSectionHeader(options: SectionHeaderOptions): HTMLElement {
  const header = document.createElement('div');
  header.className = 'image-trail-ds__section-header';
  header.classList.toggle('has-divider', options.divider !== false);
  const heading = document.createElement(`h${options.headingLevel ?? 3}`);
  heading.className = 'image-trail-ds__section-title';
  heading.textContent = options.title;
  header.append(heading);
  const actions = document.createElement('div');
  actions.className = 'image-trail-ds__section-actions';
  actions.append(...(options.actions ?? []));
  header.append(actions);
  if (options.detachable) {
    const detach = options.onDetach
      ? createIconButton({ glyph: '⧉', label: `Detach ${options.title}`, onClick: options.onDetach })
      : createIconButton({ glyph: '⧉', label: `Detach ${options.title}`, disabled: true });
    header.append(detach);
  }
  if (options.collapsible) {
    const toggle = options.onToggle
      ? createButton({ label: options.open ? 'Hide' : 'Show', variant: 'ghost', onClick: options.onToggle })
      : createButton({ label: options.open ? 'Hide' : 'Show', variant: 'ghost', disabled: true });
    toggle.classList.add('image-trail-ds__section-toggle');
    toggle.setAttribute('aria-expanded', String(options.open === true));
    header.append(toggle);
  }
  configureElement(header, options);
  return header;
}
