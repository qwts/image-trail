import type { ParsedUrlModel, PathPart, QueryField, UrlField, UrlFieldSplitSpec, UrlToken } from './types.js';
import { detectNumericType, tokenValue } from './tokenize-fields.js';

export type FieldSplitPatternResult =
  | { readonly ok: true; readonly lengths: readonly number[]; readonly normalizedPattern: string }
  | { readonly ok: false; readonly message: string };

export type FieldSplitSpecResult = UrlFieldSplitSpec | { readonly ok: false; readonly message: string };

export function parseFieldSplitPattern(pattern: string, valueLength: number): FieldSplitPatternResult {
  const parts = pattern
    .trim()
    .split(/[\s,-]+/u)
    .filter(Boolean);

  if (parts.length < 2) {
    return { ok: false, message: 'Split pattern needs at least two lengths, like 2-2-4.' };
  }

  const lengths: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/u.test(part)) {
      return { ok: false, message: 'Split pattern can only contain positive lengths.' };
    }
    const length = Number(part);
    if (!Number.isSafeInteger(length) || length <= 0) {
      return { ok: false, message: 'Split pattern can only contain positive lengths.' };
    }
    lengths.push(length);
  }

  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total !== valueLength) {
    return { ok: false, message: `Split pattern totals ${total}, but the field is ${valueLength} characters.` };
  }

  return { ok: true, lengths, normalizedPattern: lengths.join('-') };
}

export function createFieldSplitSpec(field: UrlField, pattern: string): FieldSplitSpecResult {
  const parsed = parseFieldSplitPattern(pattern, field.value.length);
  if (!parsed.ok) return parsed;
  const baseFieldId = field.splitBaseId ?? field.id;

  return {
    baseFieldId,
    location: field.location,
    partIndex: field.partIndex,
    queryIndex: field.queryIndex,
    tokenIndex: baseTokenIndexForField(field),
    lengths: parsed.lengths,
    pattern: parsed.normalizedPattern,
  };
}

export function applyFieldSplitSpecs(model: ParsedUrlModel, specs: readonly UrlFieldSplitSpec[]): ParsedUrlModel {
  if (specs.length === 0) return model;

  return {
    ...model,
    pathParts: model.pathParts.map((part, partIndex) => applyPathSplitSpecs(part, partIndex, specs)),
    queryFields: model.queryFields.map((field) => applyQuerySplitSpecs(field, specs)),
  };
}

function applyPathSplitSpecs(part: PathPart, partIndex: number, specs: readonly UrlFieldSplitSpec[]): PathPart {
  if (part.type !== 'segment') return part;
  const matchingSpecs = specs.filter((spec) => spec.location === 'path' && spec.partIndex === partIndex);
  if (matchingSpecs.length === 0) return part;
  return { ...part, tokens: applyTokenSplitSpecs(part.tokens, matchingSpecs) };
}

function applyQuerySplitSpecs(field: QueryField, specs: readonly UrlFieldSplitSpec[]): QueryField {
  const matchingSpecs = specs.filter((spec) => spec.location === 'query' && spec.queryIndex === field.index);
  if (matchingSpecs.length === 0) return field;
  return { ...field, valueTokens: applyTokenSplitSpecs(field.valueTokens, matchingSpecs) };
}

function applyTokenSplitSpecs(tokens: readonly UrlToken[], specs: readonly UrlFieldSplitSpec[]): UrlToken[] {
  const specsByTokenIndex = new Map(specs.map((spec) => [spec.tokenIndex, spec]));
  return tokens.flatMap((token, tokenIndex) => {
    const originalTokenIndex = token.originalTokenIndex ?? tokenIndex;
    const spec = specsByTokenIndex.get(originalTokenIndex);
    if (!spec) return [{ ...token, originalTokenIndex }];
    return splitToken(token, spec, originalTokenIndex);
  });
}

function splitToken(token: UrlToken, spec: UrlFieldSplitSpec, originalTokenIndex: number): UrlToken[] {
  const raw = tokenValue(token);
  const expectedLength = spec.lengths.reduce((sum, length) => sum + length, 0);
  if (raw.length !== expectedLength) return [{ ...token, originalTokenIndex }];

  let cursor = 0;
  return spec.lengths.map((length, splitPartIndex) => {
    const value = raw.slice(cursor, cursor + length);
    cursor += length;
    return {
      ...createSplitToken(value),
      originalTokenIndex,
      splitBaseId: spec.baseFieldId,
      splitPartIndex,
      splitPartCount: spec.lengths.length,
    };
  });
}

function baseTokenIndexForField(field: UrlField): number {
  if (field.originalTokenIndex !== undefined) return field.originalTokenIndex;
  if (field.splitBaseId === undefined || field.splitPartIndex === undefined) return field.tokenIndex;
  return field.tokenIndex - field.splitPartIndex;
}

function createSplitToken(value: string): UrlToken {
  const kind = detectNumericType(value);
  if (kind === 'hex' && /^0[xX]/u.test(value)) {
    const prefix = value.slice(0, 2) as '0x' | '0X';
    const digits = value.slice(2);
    return { kind, value: digits, width: paddedDigitWidth(digits), prefix, uppercase: /[A-F]/u.test(digits) };
  }

  if (kind === 'hex' || kind === 'int') {
    const digits = value.replace(/^0[xX]/u, '');
    return { kind, value, width: paddedDigitWidth(digits), uppercase: /[A-F]/u.test(value) };
  }

  return { kind, value };
}

function paddedDigitWidth(digits: string): number | undefined {
  return digits.length > 1 && digits.startsWith('0') ? digits.length : undefined;
}
