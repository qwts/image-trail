import { createFieldSplitSpec, type FieldSplitSpecResult } from './field-splits.js';
import { applyFieldDigitWidthSpecs, normalizeFieldDigitWidth, upsertFieldDigitWidthSpec } from './field-widths.js';
import { bumpUrlField, rebuildUrl, setUrlFieldValue } from './rebuild-url.js';
import type { ParsedUrlModel, UrlField, UrlFieldDigitWidthSpec } from './types.js';

export type FieldTransformId = 'set-value' | 'step' | 'digit-width' | 'split-apply' | 'split-clear';

export type FieldTransformKind = 'url' | 'state';

export interface FieldTransformDefinition {
  readonly id: FieldTransformId;
  readonly kind: FieldTransformKind;
  readonly description: string;
}

export const FIELD_TRANSFORM_REGISTRY: readonly FieldTransformDefinition[] = [
  { id: 'set-value', kind: 'url', description: 'Set a parsed field token value.' },
  { id: 'step', kind: 'url', description: 'Increment or decrement a parsed numeric field.' },
  { id: 'digit-width', kind: 'url', description: 'Apply or clear a parsed field digit-width override.' },
  { id: 'split-apply', kind: 'state', description: 'Split a parsed field into smaller editable parts.' },
  { id: 'split-clear', kind: 'state', description: 'Clear a parsed field split.' },
] as const;

export function fieldTransformDefinition(id: FieldTransformId): FieldTransformDefinition {
  const definition = FIELD_TRANSFORM_REGISTRY.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown field transform: ${String(id)}`);
  return definition;
}

export interface FieldUrlTransformResult {
  readonly ok: true;
  readonly id: FieldTransformId;
  readonly model: ParsedUrlModel;
  readonly url: string;
  readonly attemptedFieldIds: readonly string[];
}

export interface FieldDigitWidthTransformResult extends FieldUrlTransformResult {
  readonly fieldDigitWidthSpecs: readonly UrlFieldDigitWidthSpec[];
}

export type FieldTransformValidationResult = { readonly ok: false; readonly message: string };

export function applySetFieldValueTransform(model: ParsedUrlModel, field: UrlField, nextValue: string): FieldUrlTransformResult {
  return toUrlTransformResult('set-value', setUrlFieldValue(model, field, nextValue), [field.id]);
}

export function applyStepFieldValueTransform(model: ParsedUrlModel, field: UrlField, delta: number): FieldUrlTransformResult {
  return toUrlTransformResult('step', bumpUrlField(model, field, delta), [field.id]);
}

export function applyFieldDigitWidthTransform(
  model: ParsedUrlModel,
  fieldId: string,
  value: string,
  specs: readonly UrlFieldDigitWidthSpec[],
): FieldDigitWidthTransformResult | FieldTransformValidationResult {
  const normalized = normalizeFieldDigitWidth(value);
  if (typeof normalized === 'object' && normalized !== null && 'ok' in normalized) return normalized;

  const fieldDigitWidthSpecs = upsertFieldDigitWidthSpec(specs, fieldId, normalized);
  const nextModel = applyFieldDigitWidthSpecs(model, fieldDigitWidthSpecs);
  return {
    ...toUrlTransformResult('digit-width', nextModel, [fieldId]),
    fieldDigitWidthSpecs,
  };
}

export function applyFieldSplitTransform(field: UrlField, pattern: string): FieldSplitSpecResult {
  return createFieldSplitSpec(field, pattern);
}

export function clearFieldSplitTransform(baseFieldId: string): { readonly baseFieldId: string } {
  return { baseFieldId };
}

function toUrlTransformResult(id: FieldTransformId, model: ParsedUrlModel, attemptedFieldIds: readonly string[]): FieldUrlTransformResult {
  return {
    ok: true,
    id,
    model,
    url: rebuildUrl(model),
    attemptedFieldIds,
  };
}
