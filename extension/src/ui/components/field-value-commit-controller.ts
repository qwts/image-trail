import type { UrlField } from '../../core/url/types.js';

export type NumericFieldDisplayMode = 'decimal' | 'hex';

export interface FieldValueCommitControllerOptions {
  readonly input: HTMLInputElement;
  readonly field: UrlField;
  readonly privacyMode: boolean;
  readonly getDisplayMode: () => NumericFieldDisplayMode | null;
  readonly getReferenceValue: () => string;
  readonly onValueChange: (fieldId: string, value: string) => void;
  readonly onInvalidValueCommit: () => void;
}

export interface FieldValueCommitController {
  readonly commit: () => void;
  readonly commitAndBlurFocusedValue: () => void;
  readonly handleChange: () => void;
  readonly handleKeydown: (event: KeyboardEvent) => void;
}

export function numericFieldCommitValue(field: UrlField, mode: NumericFieldDisplayMode, raw: string): string | null {
  const value = parseNumericInput(raw, mode);
  if (value === null) return null;
  if (field.tokenKind === 'int') return value.toString(10);
  if (field.tokenKind === 'hex') return formatHexSourceValue(field.value, value);
  return raw.trim();
}

export function createFieldValueCommitController(options: FieldValueCommitControllerOptions): FieldValueCommitController {
  let suppressedValueChange: string | null = null;

  const commit = (): void => {
    const referenceValue = options.getReferenceValue();
    if (options.input.value === referenceValue || suppressedValueChange === options.input.value) return;

    const rawValue = options.input.value;
    const isStructuralCommit = rawValue.trim() === '' || /[/&=?#]|%(?:2f|3f|26|3d|23)/iu.test(rawValue);
    const displayMode = options.getDisplayMode();
    const nextValue = displayMode === null || isStructuralCommit ? rawValue : numericFieldCommitValue(options.field, displayMode, rawValue);
    if (nextValue === null) {
      options.input.value = referenceValue;
      options.onInvalidValueCommit();
      return;
    }
    if (nextValue === options.field.value) return;

    suppressedValueChange = rawValue;
    options.onValueChange(options.field.id, nextValue);
  };

  return {
    commit,
    commitAndBlurFocusedValue: () => {
      if (options.privacyMode || !isFocusedWithinRoot(options.input)) return;
      if (options.input.value !== options.getReferenceValue()) commit();
      options.input.blur();
    },
    handleChange: () => {
      if (options.privacyMode) return;
      if (suppressedValueChange === options.input.value) {
        suppressedValueChange = null;
        return;
      }
      commit();
    },
    handleKeydown: (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (options.privacyMode) return;
      commit();
      options.input.blur();
    },
  };
}

function parseNumericInput(raw: string, mode: NumericFieldDisplayMode): bigint | null {
  const value = raw.trim();
  return mode === 'decimal' ? parseDecimal(value) : parseHex(value);
}

function parseDecimal(value: string): bigint | null {
  if (!/^\d+$/u.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseHex(value: string): bigint | null {
  const digits = value.replace(/^0[xX]/u, '');
  if (!/^[0-9a-fA-F]+$/u.test(digits)) return null;
  try {
    return BigInt(`0x${digits}`);
  } catch {
    return null;
  }
}

function formatHexSourceValue(source: string, value: bigint): string {
  const prefix = source.match(/^0[xX]/u)?.[0] ?? '';
  const sourceDigits = source.replace(/^0[xX]/u, '');
  const width = sourceDigits.startsWith('0') ? sourceDigits.length : undefined;
  const raw = value.toString(16).padStart(width ?? 0, '0');
  const digits = /[A-F]/u.test(sourceDigits) ? raw.toUpperCase() : raw.toLowerCase();
  return `${prefix}${digits}`;
}

function isFocusedWithinRoot(input: HTMLInputElement): boolean {
  const root = input.getRootNode();
  return 'activeElement' in root ? root.activeElement === input : document.activeElement === input;
}
