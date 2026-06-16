import { tokenValue } from './tokenize-fields.js';
import type { ParsedUrlModel, UrlField, UrlToken } from './types.js';

export function rebuildUrl(model: ParsedUrlModel): string {
  const path = `/${model.pathSegments.map(rebuildPathSegment).join('/')}`;
  const query = model.queryFields.length > 0 ? `?${model.queryFields.map(rebuildQueryField).join('&')}` : '';
  return `${model.protocol}//${model.host}${path}${query}${model.hash}`;
}

export function bumpUrlField(model: ParsedUrlModel, field: UrlField, delta: number): ParsedUrlModel {
  return setUrlFieldToken(model, field, (token) => bumpToken(token, delta));
}

function setUrlFieldToken(model: ParsedUrlModel, field: UrlField, update: (token: UrlToken) => UrlToken): ParsedUrlModel {
  if (field.location === 'path' && field.segmentIndex !== undefined) {
    return {
      ...model,
      pathSegments: model.pathSegments.map((segment, segmentIndex) => segmentIndex === field.segmentIndex ? {
        ...segment,
        edited: true,
        tokens: segment.tokens.map((token, tokenIndex) => tokenIndex === field.tokenIndex ? update(token) : token),
      } : segment),
    };
  }

  if (field.location === 'query' && field.queryIndex !== undefined) {
    return {
      ...model,
      queryFields: model.queryFields.map((queryField) => queryField.index === field.queryIndex ? {
        ...queryField,
        valueTokens: queryField.valueTokens.map((token, tokenIndex) => tokenIndex === field.tokenIndex ? update(token) : token),
      } : queryField),
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
  return { ...token, value: cased.padStart(token.width ?? cased.length, '0') };
}

function rebuildQueryField(field: ParsedUrlModel['queryFields'][number]): string {
  const key = encodeQueryKey(field.key);
  if (!field.hasEquals) return key;
  return `${key}=${encodeQueryComponent(field.valueTokens.map(tokenValue).join(''))}`;
}

function rebuildPathSegment(segment: ParsedUrlModel['pathSegments'][number]): string {
  const value = segment.tokens.map(tokenValue).join('');
  return !segment.edited && value === segment.raw ? segment.rawEncoded.replace(/%2f/giu, '%2F') : encodePathSegment(value);
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value)
    .replaceAll('%26', '&')
    .replaceAll('%3D', '=')
    .replace(/[!'()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeQueryKey(value: string): string {
  return encodeURIComponent(value);
}

function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value).replaceAll('%20', '+');
}
