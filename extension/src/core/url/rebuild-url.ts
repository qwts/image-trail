import { detectNumericType, tokenValue } from './tokenize-fields.js';
import type { ParsedUrlModel, UrlField, UrlToken } from './types.js';

export function rebuildUrl(model: ParsedUrlModel): string {
  const path = rebuildPath(model);
  const query = model.queryFields.length > 0 ? `${model.queryPrefix || '?'}${model.queryFields.map(rebuildQueryField).join('&')}` : '';
  return `${model.protocol}//${model.host}${path}${query}${model.hash}`;
}

export function bumpUrlField(model: ParsedUrlModel, field: UrlField, delta: number): ParsedUrlModel {
  return setUrlFieldToken(model, field, (token) => bumpToken(token, delta));
}

export function setUrlFieldValue(model: ParsedUrlModel, field: UrlField, nextValue: string): ParsedUrlModel {
  const normalized = normalizeTokenValue(nextValue);
  return setUrlFieldToken(model, field, (token) => setTokenValue(token, normalized));
}

function setUrlFieldToken(model: ParsedUrlModel, field: UrlField, update: (token: UrlToken) => UrlToken): ParsedUrlModel {
  if (field.location === 'path' && field.partIndex !== undefined) {
    return {
      ...model,
      pathParts: model.pathParts.map((part, partIndex) =>
        partIndex === field.partIndex && part.type === 'segment'
          ? {
              ...part,
              edited: true,
              tokens: part.tokens.map((token, tokenIndex) => (tokenIndex === field.tokenIndex ? update(token) : token)),
            }
          : part,
      ),
    };
  }

  if (field.location === 'query' && field.queryIndex !== undefined) {
    return {
      ...model,
      queryFields: model.queryFields.map((queryField) =>
        queryField.index === field.queryIndex
          ? {
              ...queryField,
              valueTokens: queryField.valueTokens.map((token, tokenIndex) => (tokenIndex === field.tokenIndex ? update(token) : token)),
            }
          : queryField,
      ),
    };
  }

  return model;
}

function bumpToken(token: UrlToken, delta: number): UrlToken {
  if (token.kind === 'text') return token;
  const radix = token.kind === 'hex' ? 16 : 10;
  const current = BigInt(radix === 16 ? `0x${token.value}` : token.value);
  const next = current + BigInt(delta);
  const clamped = next < 0n ? 0n : next;
  const raw = clamped.toString(radix);
  const cased = token.kind === 'hex' && token.uppercase ? raw.toUpperCase() : raw.toLowerCase();
  return { ...token, value: padTokenValue(cased, token.width) };
}

function normalizeTokenValue(raw: string): string {
  return raw.trim();
}

function setTokenValue(token: UrlToken, raw: string): UrlToken {
  const normalized = raw.trim();
  const kind = detectNumericType(normalized);

  if (kind === 'text') return { kind, value: normalized };

  const hasPrefix = /^0[xX]/u.test(normalized);
  const digits = hasPrefix ? normalized.slice(2) : normalized;
  const width = nextTokenWidth(token.width, digits);
  const uppercase = kind === 'hex' ? /[A-F]/u.test(digits) || token.uppercase === true : undefined;
  const value = kind === 'hex' && uppercase ? digits.toUpperCase() : kind === 'hex' ? digits.toLowerCase() : digits;

  if (kind === 'hex' && hasPrefix) {
    return {
      kind,
      value: padTokenValue(value, width),
      width,
      prefix: normalized.slice(0, 2) as '0x' | '0X',
      uppercase,
    };
  }

  return {
    kind,
    value: padTokenValue(value, width),
    width,
    uppercase,
  };
}

function nextTokenWidth(previousWidth: number | undefined, digits: string): number | undefined {
  if (previousWidth !== undefined) return Math.max(previousWidth, digits.length);
  return digits.length > 1 && digits.startsWith('0') ? digits.length : undefined;
}

function padTokenValue(value: string, width: number | undefined): string {
  return width === undefined ? value : value.padStart(width, '0');
}

function rebuildQueryField(field: ParsedUrlModel['queryFields'][number]): string {
  const key = encodeQueryKey(field.key);
  if (!field.hasEquals) return key;
  return `${key}=${encodeQueryComponent(field.valueTokens.map(tokenValue).join(''))}`;
}

function rebuildPath(model: ParsedUrlModel): string {
  const parts = model.pathParts.map((part) => {
    if (part.type === 'sep') return part.raw;
    return rebuildPathSegment(part);
  });
  return parts.join('') || '/';
}

function rebuildPathSegment(segment: Extract<ParsedUrlModel['pathParts'][number], { type: 'segment' }>): string {
  const value = segment.tokens.map(tokenValue).join('');
  return !segment.edited ? segment.raw : encodePathSegment(value);
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value)
    .replaceAll('%26', '&')
    .replaceAll('%3D', '=')
    .replace(/[!'()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replaceAll('%20', '+');
}

function encodeQueryKey(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
