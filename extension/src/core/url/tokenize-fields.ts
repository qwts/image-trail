import type { ParsedUrlModel, UrlField, UrlToken } from './types.js';

const TOKEN_PATTERN = /(?:0[xX][0-9a-fA-F]+|[0-9a-fA-F]*\d[0-9a-fA-F]*)/gu;

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

  model.pathParts.forEach((part, partIndex) => {
    if (part.type !== 'segment') return;
    const labelBase = isLikelyFilename(part.tokens.map(tokenValue).join('')) ? 'file' : `path ${partIndex}`;
    part.tokens.forEach((token, tokenIndex) => {
      const splitLabel = splitLabelSuffix(token);
      fields.push({
        id: `p:${partIndex}:${tokenIndex}`,
        location: 'path',
        label: `${labelBase === 'file' ? `file ${tokenIndex}` : `${labelBase}.${tokenIndex}`}${splitLabel}`,
        value: tokenValue(token),
        tokenKind: token.kind,
        digitWidth: token.width,
        partIndex,
        tokenIndex,
        originalTokenIndex: token.originalTokenIndex,
        splitBaseId: token.splitBaseId,
        splitPartIndex: token.splitPartIndex,
        splitPartCount: token.splitPartCount,
      });
    });
  });

  model.queryFields.forEach((field) => {
    field.valueTokens.forEach((token, tokenIndex) => {
      const splitLabel = splitLabelSuffix(token);
      fields.push({
        id: `q:${field.index}:${tokenIndex}`,
        location: 'query',
        label: `query ${field.key}${splitLabel}`,
        value: tokenValue(token),
        tokenKind: token.kind,
        digitWidth: token.width,
        queryIndex: field.index,
        tokenIndex,
        originalTokenIndex: token.originalTokenIndex,
        splitBaseId: token.splitBaseId,
        splitPartIndex: token.splitPartIndex,
        splitPartCount: token.splitPartCount,
      });
    });
  });

  return fields;
}

export function selectDefaultField(fields: UrlField[]): UrlField | null {
  return fields.find((field) => field.tokenKind === 'int') ?? fields.find((field) => field.tokenKind === 'hex') ?? null;
}

function createEditableToken(value: string): UrlToken {
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

function isLikelyFilename(segment: string): boolean {
  return /\.[A-Za-z0-9]{2,8}$/u.test(segment) || segment.includes('.');
}

function splitLabelSuffix(token: UrlToken): string {
  if (token.splitPartIndex === undefined || token.splitPartCount === undefined) return '';
  return ` ${token.splitPartIndex + 1}/${token.splitPartCount}`;
}

export function detectNumericType(value: string): UrlToken['kind'] {
  const text = String(value || '');
  if (/^0[xX][0-9a-fA-F]+$/u.test(text)) return 'hex';
  if (/^\d+$/u.test(text)) return 'int';
  if (/^[0-9a-fA-F]*\d[0-9a-fA-F]*$/u.test(text) && /[a-fA-F]/u.test(text)) return 'hex';
  return 'text';
}
