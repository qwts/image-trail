import type { ParsedUrlModel, UrlField, UrlToken } from './types.js';
import { bumpToken, padTokenValue, setUrlFieldToken, setUrlFieldValue } from './rebuild-url.js';

export type FieldTransformGroup = 'step' | 'value' | 'format' | 'reshape';

export interface FieldTransform {
  readonly id: string;
  readonly label: string;
  readonly group: FieldTransformGroup;
  readonly appliesTo: (field: UrlField) => boolean;
  readonly needsParam: boolean;
  readonly apply: (
    ctx: { readonly model: ParsedUrlModel; readonly field: UrlField },
    param: string,
  ) => { readonly ok: true; readonly model: ParsedUrlModel } | { readonly ok: false; readonly message: string };
}

function isNumericField(field: UrlField): boolean {
  return field.tokenKind === 'int' || field.tokenKind === 'hex';
}

function applyNumericToken(token: UrlToken, fn: (current: bigint) => bigint): UrlToken {
  if (token.kind === 'text') return token;
  const radix = token.kind === 'hex' ? 16 : 10;
  const current = BigInt(radix === 16 ? `0x${token.value}` : token.value);
  const next = fn(current);
  const clamped = next < 0n ? 0n : next;
  const raw = clamped.toString(radix);
  const cased = token.kind === 'hex' && token.uppercase ? raw.toUpperCase() : raw.toLowerCase();
  return { ...token, value: padTokenValue(cased, token.width) };
}

function numericTransform(
  id: string,
  label: string,
  fn: (current: bigint, operand: bigint) => bigint,
  needsParam: boolean,
): FieldTransform {
  return {
    id,
    label,
    group: 'step',
    appliesTo: isNumericField,
    needsParam,
    apply: ({ model, field }, param) => {
      const operand = needsParam ? parseBigIntParam(param) : 1n;
      if (operand === null) return { ok: false, message: `${label} requires a valid integer.` };
      const next = setUrlFieldToken(model, field, (token) => applyNumericToken(token, (v) => fn(v, operand)));
      return { ok: true, model: next };
    },
  };
}

function parseBigIntParam(raw: string): bigint | null {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^-?\d+$/u.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

const incrementTransform = numericTransform('increment', '+', (v) => v + 1n, false);
const decrementTransform = numericTransform('decrement', '−', (v) => v - 1n, false);
const multiplyTransform = numericTransform('multiply', '×', (v, k) => v * k, true);
const divideTransform: FieldTransform = {
  ...numericTransform('divide', '÷', (v, k) => v / k, true),
  apply: ({ model, field }, param) => {
    const operand = parseBigIntParam(param);
    if (operand === null) return { ok: false, message: 'Divide requires a valid integer.' };
    if (operand === 0n) return { ok: false, message: 'Cannot divide by zero.' };
    const next = setUrlFieldToken(model, field, (token) => applyNumericToken(token, (v) => v / operand));
    return { ok: true, model: next };
  },
};

const setValueTransform: FieldTransform = {
  id: 'set-value',
  label: 'Set',
  group: 'value',
  appliesTo: () => true,
  needsParam: true,
  apply: ({ model, field }, param) => {
    const next = setUrlFieldValue(model, field, param);
    return { ok: true, model: next };
  },
};

export const FIELD_TRANSFORMS: readonly FieldTransform[] = [
  decrementTransform,
  incrementTransform,
  multiplyTransform,
  divideTransform,
  setValueTransform,
];

export function findTransform(id: string): FieldTransform | undefined {
  return FIELD_TRANSFORMS.find((t) => t.id === id);
}

export function applicableTransforms(field: UrlField): readonly FieldTransform[] {
  return FIELD_TRANSFORMS.filter((t) => t.appliesTo(field));
}

export { applyNumericToken, isNumericField };

export function applyTransform(
  model: ParsedUrlModel,
  field: UrlField,
  transformId: string,
  param: string,
): { readonly ok: true; readonly model: ParsedUrlModel } | { readonly ok: false; readonly message: string } {
  const transform = findTransform(transformId);
  if (!transform) return { ok: false, message: `Unknown transform: ${transformId}` };
  if (!transform.appliesTo(field)) return { ok: false, message: `${transform.label} does not apply to ${field.label}.` };
  return transform.apply({ model, field }, param);
}
