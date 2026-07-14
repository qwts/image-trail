import type { UrlField } from '../../core/url/types.js';
import { fieldSupportsTrailNavigation } from '../field-editor-view-model.js';
import type { NumericFieldDisplayMode } from './field-value-commit-controller.js';

export interface EditableField {
  readonly field: UrlField;
  readonly value: string;
}

export function fieldDisplayValue(field: EditableField): string {
  if (field.field.tokenKind !== 'hex') return field.field.value || '(empty)';
  const raw = field.value;
  try {
    const digits = raw.replace(/^0[xX]/u, '');
    return `${raw} (${BigInt(`0x${digits}`).toString(10)})`;
  } catch {
    return raw || '(empty)';
  }
}

export function defaultNumericFieldDisplayMode(field: UrlField): NumericFieldDisplayMode | null {
  if (field.tokenKind === 'int') return 'decimal';
  if (field.tokenKind === 'hex') return 'hex';
  return null;
}

export function fieldSplitLengthLabel(field: EditableField, privacyMode: boolean): string {
  if (privacyMode) return 'Length hidden';
  const length = field.value.length;
  const unit = field.field.tokenKind === 'int' ? `digit${length === 1 ? '' : 's'}` : `character${length === 1 ? '' : 's'}`;
  return `Length: ${length} ${unit}`;
}

export function numericFieldInputDisplayValue(field: UrlField, mode: NumericFieldDisplayMode): string {
  const value = parseNumericFieldSourceValue(field);
  if (value === null) return field.value;
  if (mode === 'decimal') return value.toString(10);
  if (field.tokenKind === 'hex') return field.value;
  return `0x${value.toString(16)}`;
}

export function fieldDigitWidthInputDisplay(
  field: UrlField,
  digitWidth: number | undefined,
  privacyMode: boolean,
): { readonly value: string; readonly placeholder: string } {
  if (privacyMode) return { value: '', placeholder: '' };
  return {
    value: digitWidth === undefined ? '' : String(digitWidth),
    placeholder: field.digitWidth === undefined ? 'auto' : String(field.digitWidth),
  };
}

export function fieldReservesTrailControlSlot(field: UrlField): boolean {
  return fieldSupportsTrailNavigation(field);
}

function parseNumericFieldSourceValue(field: UrlField): bigint | null {
  const digits = field.tokenKind === 'hex' ? field.value.replace(/^0[xX]/u, '') : field.value;
  const pattern = field.tokenKind === 'hex' ? /^[0-9a-fA-F]+$/u : /^\d+$/u;
  if ((field.tokenKind !== 'int' && field.tokenKind !== 'hex') || !pattern.test(digits)) return null;
  try {
    return BigInt(field.tokenKind === 'hex' ? `0x${digits}` : digits);
  } catch {
    return null;
  }
}
