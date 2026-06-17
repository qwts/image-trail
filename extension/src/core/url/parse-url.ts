import { tokenizeValue } from './tokenize-fields.js';
import type { ParsedUrlModel, QueryField } from './types.js';

export function parseUrl(input: string): ParsedUrlModel {
  const normalizedInput = input.replaceAll('&amp;', '&');
  const url = new URL(normalizedInput);
  const pathSegments = url.pathname
    .split('/')
    .slice(1)
    .map((raw) => {
      const decoded = safeDecode(raw, 'path');
      return { type: 'segment' as const, raw: decoded, rawEncoded: raw, tokens: tokenizeValue(decoded) };
    });

  return {
    protocol: url.protocol,
    host: url.host,
    hash: url.hash,
    pathSegments,
    queryFields: parseQueryFields(url.search),
  };
}

function parseQueryFields(search: string): QueryField[] {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (!query) return [];

  return query.split('&').map((part, index) => {
    const equalsIndex = part.indexOf('=');
    const hasEquals = equalsIndex >= 0;
    const keyRaw = hasEquals ? part.slice(0, equalsIndex) : part;
    const valueRaw = hasEquals ? part.slice(equalsIndex + 1) : '';
    const value = safeDecode(valueRaw.replaceAll('+', ' '), 'query');
    return {
      type: 'query' as const,
      index,
      hasEquals,
      key: safeDecode(keyRaw.replaceAll('+', ' '), 'query'),
      keyRaw,
      valueRaw,
      valueTokens: hasEquals ? tokenizeValue(value) : [],
    };
  });
}

function safeDecode(value: string, context: 'path' | 'query'): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return context === 'query' ? value.replaceAll('+', ' ') : value;
  }
}
