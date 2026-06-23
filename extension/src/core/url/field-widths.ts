import type { ParsedUrlModel, PathPart, QueryField, UrlFieldDigitWidthSpec, UrlToken } from './types.js';

export function normalizeFieldDigitWidth(value: string): number | null | { readonly ok: false; readonly message: string } {
  const normalized = value.trim();
  if (normalized === '') return null;
  if (!/^\d+$/u.test(normalized)) return { ok: false, message: 'Digit width must be a whole number.' };
  const width = Number(normalized);
  if (!Number.isSafeInteger(width) || width < 1 || width > 64) {
    return { ok: false, message: 'Digit width must be between 1 and 64.' };
  }
  return width;
}

export function upsertFieldDigitWidthSpec(
  specs: readonly UrlFieldDigitWidthSpec[],
  fieldId: string,
  width: number | null,
): readonly UrlFieldDigitWidthSpec[] {
  const rest = specs.filter((spec) => spec.fieldId !== fieldId);
  return width === null ? rest : [...rest, { fieldId, width }];
}

export function applyFieldDigitWidthSpecs(model: ParsedUrlModel, specs: readonly UrlFieldDigitWidthSpec[]): ParsedUrlModel {
  if (specs.length === 0) return model;
  const widthByFieldId = new Map(specs.map((spec) => [spec.fieldId, spec.width]));

  return {
    ...model,
    pathParts: model.pathParts.map((part, partIndex) => applyPathDigitWidthSpecs(part, partIndex, widthByFieldId)),
    queryFields: model.queryFields.map((field) => applyQueryDigitWidthSpecs(field, widthByFieldId)),
  };
}

function applyPathDigitWidthSpecs(part: PathPart, partIndex: number, widthByFieldId: ReadonlyMap<string, number>): PathPart {
  if (part.type !== 'segment') return part;
  return {
    ...part,
    edited:
      part.edited || part.tokens.some((token, tokenIndex) => hasDigitWidthSpec(widthByFieldId, `p:${partIndex}:${tokenIndex}`, token)),
    tokens: part.tokens.map((token, tokenIndex) => applyTokenDigitWidth(token, widthByFieldId.get(`p:${partIndex}:${tokenIndex}`))),
  };
}

function applyQueryDigitWidthSpecs(field: QueryField, widthByFieldId: ReadonlyMap<string, number>): QueryField {
  return {
    ...field,
    valueTokens: field.valueTokens.map((token, tokenIndex) =>
      applyTokenDigitWidth(token, widthByFieldId.get(`q:${field.index}:${tokenIndex}`)),
    ),
  };
}

function hasDigitWidthSpec(widthByFieldId: ReadonlyMap<string, number>, fieldId: string, token: UrlToken): boolean {
  return token.kind !== 'text' && widthByFieldId.has(fieldId);
}

function applyTokenDigitWidth(token: UrlToken, width: number | undefined): UrlToken {
  if (token.kind === 'text' || width === undefined) return token;
  const nextWidth = Math.max(width, token.value.length);
  return { ...token, value: token.value.padStart(nextWidth, '0'), width: nextWidth };
}
