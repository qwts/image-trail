import type { ParsedUrlModel, UrlField, UrlToken } from './types.js';

const TOKEN_PATTERN = /(0[xX][0-9a-fA-F]+|(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{2,}|\d+)/gu;

export function tokenizeValue(value: string): UrlToken[] {
  const tokens: UrlToken[] = [];
  let cursor = 0;

  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const matched = match[0];
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ kind: 'text', value: value.slice(cursor, index) });
    tokens.push(createEditableToken(matched));
    cursor = index + matched.length;
  }

  if (cursor < value.length) tokens.push({ kind: 'text', value: value.slice(cursor) });
  return tokens.length > 0 ? tokens : [{ kind: 'text', value }];
}

export function tokenValue(token: UrlToken): string {
  if (token.kind !== 'hex' || !token.prefix) return token.value;
  return `${token.prefix}${token.value}`;
}

export function collectUrlFields(model: ParsedUrlModel): UrlField[] {
  const fields: UrlField[] = [];

  model.pathSegments.forEach((segment, segmentIndex) => {
    segment.tokens.forEach((token, tokenIndex) => {
      if (token.kind === 'text') return;
      fields.push({
        id: `p:${segmentIndex}:${tokenIndex}`,
        location: 'path',
        label: `path ${segmentIndex + 1} ${token.kind} ${tokenValue(token)}`,
        tokenKind: token.kind,
        segmentIndex,
        tokenIndex,
      });
    });
  });

  model.queryFields.forEach((field) => {
    field.valueTokens.forEach((token, tokenIndex) => {
      if (token.kind === 'text') return;
      fields.push({
        id: `q:${field.index}:${tokenIndex}`,
        location: 'query',
        label: `query ${field.key} ${token.kind} ${tokenValue(token)}`,
        tokenKind: token.kind,
        queryIndex: field.index,
        tokenIndex,
      });
    });
  });

  return fields;
}

export function selectDefaultField(fields: UrlField[]): UrlField | null {
  return fields.find((field) => field.tokenKind === 'int') ?? fields.find((field) => field.tokenKind === 'hex') ?? null;
}

function createEditableToken(value: string): UrlToken {
  if (/^0[xX]/u.test(value)) {
    const prefix = value.slice(0, 2) as '0x' | '0X';
    const digits = value.slice(2);
    return { kind: 'hex', value: digits, width: digits.length, prefix, uppercase: /[A-F]/u.test(digits) };
  }

  if (/\d/u.test(value) && /[a-fA-F]/u.test(value)) {
    return { kind: 'hex', value, width: value.length, uppercase: /[A-F]/u.test(value) };
  }

  return { kind: 'int', value, width: value.length };
}
