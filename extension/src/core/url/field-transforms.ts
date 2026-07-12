import { createFieldSplitSpec } from './field-splits.js';
import {
  applyFieldDigitWidthSpecs,
  clearFieldDigitWidthSpec,
  normalizeFieldDigitWidth,
  upsertFieldDigitWidthSpec,
} from './field-widths.js';
import { bumpUrlField, rebuildUrl, setUrlFieldValue } from './rebuild-url.js';
import { collectUrlFields } from './tokenize-fields.js';
import type { ParsedUrlModel, UrlField, UrlFieldDigitWidthSpec, UrlFieldSplitSpec } from './types.js';

export type FieldTransformId =
  'set-value' | 'step' | 'digit-width' | 'split-apply' | 'split-clear' | 'reset-field' | 'reset-structure' | 'reset-all';

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
  { id: 'reset-field', kind: 'url', description: 'Reset one parsed field back to the edit-session baseline.' },
  { id: 'reset-structure', kind: 'url', description: 'Reset parsed URL structure back to the edit-session baseline.' },
  { id: 'reset-all', kind: 'url', description: 'Reset all parsed fields back to the edit-session baseline.' },
] as const;

export function fieldTransformDefinition(id: FieldTransformId): FieldTransformDefinition {
  const definition = FIELD_TRANSFORM_REGISTRY.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown field transform: ${String(id)}`);
  return definition;
}

export type FieldTransformSuccess<TPayload extends object = object> = {
  readonly ok: true;
  readonly id: FieldTransformId;
  readonly kind: FieldTransformKind;
} & TPayload;

export interface FieldTransformFailure {
  readonly ok: false;
  readonly id: FieldTransformId;
  readonly kind: FieldTransformKind;
  readonly message: string;
}

export type FieldTransformResult<TPayload extends object = object> = FieldTransformSuccess<TPayload> | FieldTransformFailure;

export type FieldUrlTransformResult = FieldTransformSuccess<{
  readonly model: ParsedUrlModel;
  readonly url: string;
  readonly attemptedFieldIds: readonly string[];
}>;

export type FieldDigitWidthTransformResult = FieldTransformResult<{
  readonly model: ParsedUrlModel;
  readonly url: string;
  readonly attemptedFieldIds: readonly string[];
  readonly fieldDigitWidthSpecs: readonly UrlFieldDigitWidthSpec[];
}>;

export type FieldSplitTransformResult = FieldTransformResult<{
  readonly splitSpec: UrlFieldSplitSpec;
}>;

export type FieldSplitClearTransformResult = FieldTransformResult<{
  readonly baseFieldId: string;
}>;

export type FieldResetTransformResult = FieldTransformResult<{
  readonly model: ParsedUrlModel;
  readonly url: string;
  readonly attemptedFieldIds: readonly string[];
  readonly resetBaseFieldId: string;
}>;

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
): FieldDigitWidthTransformResult {
  const normalized = normalizeFieldDigitWidth(value);
  if (typeof normalized === 'object' && normalized !== null && 'ok' in normalized) {
    return toFieldTransformFailure('digit-width', normalized.message);
  }

  const existingSpec = specs.find((spec) => spec.fieldId === fieldId);
  const sourceWidth = existingSpec ? existingSpec.sourceWidth : collectUrlFields(model).find((field) => field.id === fieldId)?.digitWidth;
  const fieldDigitWidthSpecs = upsertFieldDigitWidthSpec(specs, fieldId, normalized, sourceWidth);
  const baseModel = existingSpec ? clearFieldDigitWidthSpec(model, existingSpec, fieldId) : model;
  const nextModel = applyFieldDigitWidthSpecs(baseModel, fieldDigitWidthSpecs);
  return {
    ...toUrlTransformResult('digit-width', nextModel, [fieldId]),
    fieldDigitWidthSpecs,
  };
}

export function applyFieldSplitTransform(field: UrlField, pattern: string): FieldSplitTransformResult {
  const splitSpec = createFieldSplitSpec(field, pattern);
  if ('ok' in splitSpec) return toFieldTransformFailure('split-apply', splitSpec.message);
  return {
    ...toFieldTransformSuccess('split-apply'),
    splitSpec,
  };
}

export function clearFieldSplitTransform(baseFieldId: string): FieldSplitClearTransformResult {
  return {
    ...toFieldTransformSuccess('split-clear'),
    baseFieldId,
  };
}

export function applyResetFieldTransform(
  currentBaseModel: ParsedUrlModel,
  currentField: UrlField,
  baselineBaseModel: ParsedUrlModel,
): FieldResetTransformResult {
  const resetBaseFieldId = currentField.splitBaseId ?? currentField.id;
  const currentBaseField = collectUrlFields(currentBaseModel).find((field) => field.id === resetBaseFieldId);
  const baselineBaseField = collectUrlFields(baselineBaseModel).find((field) => field.id === resetBaseFieldId);
  if (!currentBaseField || !baselineBaseField) {
    return toFieldTransformFailure('reset-field', 'Reset baseline is no longer available for this field.');
  }
  return {
    ...toUrlTransformResult('reset-field', setUrlFieldValue(currentBaseModel, currentBaseField, baselineBaseField.value), []),
    resetBaseFieldId,
  };
}

function toUrlTransformResult(id: FieldTransformId, model: ParsedUrlModel, attemptedFieldIds: readonly string[]): FieldUrlTransformResult {
  return {
    ...toFieldTransformSuccess(id),
    model,
    url: rebuildUrl(model),
    attemptedFieldIds,
  };
}

function toFieldTransformSuccess(id: FieldTransformId): FieldTransformSuccess {
  return {
    ok: true,
    id,
    kind: fieldTransformDefinition(id).kind,
  };
}

function toFieldTransformFailure(id: FieldTransformId, message: string): FieldTransformFailure {
  return {
    ok: false,
    id,
    kind: fieldTransformDefinition(id).kind,
    message,
  };
}
