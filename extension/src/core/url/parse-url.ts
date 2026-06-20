import { tokenizeValue } from './tokenize-fields.js';
import type { ParsedUrlModel, PathPart, QueryField } from './types.js';

export function parseUrl(input: string): ParsedUrlModel {
  const url = resolveUrl(input);
  const querySplit = maybeSplitQueryLikePath(url);
  const pathParts = splitPreservingSlashStyle(querySplit.pathname).map((part) =>
    part.type === 'segment'
      ? {
          ...part,
          tokens: tokenizeValue(safeDecodePathSegment(part.raw)),
        }
      : part,
  );

  return {
    protocol: url.protocol,
    host: url.host,
    hash: url.hash,
    pathParts,
    queryPrefix: querySplit.queryPrefix,
    queryFields: parseQueryFields(querySplit.searchBody),
  };
}

function resolveUrl(input: string): URL {
  const cleaned = decodeHtmlEntities(String(input || '').trim());
  const baseHref = typeof window !== 'undefined' ? window.location.href : 'https://example.invalid/';
  const fallback = cleaned || baseHref;

  try {
    return new URL(fallback, baseHref);
  } catch {
    return new URL(fallback.replaceAll(' ', '%20'), baseHref);
  }
}

function decodeHtmlEntities(value: string): string {
  const withQuerySeparators = value.replace(/&amp;(?=[A-Za-z0-9_.~-]+=)/gu, '&');
  return withQuerySeparators.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
}

function encodedSlashAt(value: string, index: number): string {
  const match = value.slice(index).match(/^%(?:25)*2f/iu);
  return match?.[0] ?? '';
}

function splitPreservingSlashStyle(pathname: string): PathPart[] {
  const parts: PathPart[] = [];
  let buffer = '';
  let index = 0;

  while (index < pathname.length) {
    const char = pathname.charAt(index);
    const encodedSlash = encodedSlashAt(pathname, index);
    if (char === '/' || encodedSlash) {
      if (buffer) {
        parts.push({ type: 'segment', raw: buffer, tokens: [] });
        buffer = '';
      }

      if (char === '/') {
        parts.push({ type: 'sep', raw: '/' });
        index += 1;
      } else {
        parts.push({ type: 'sep', raw: normalizeEncodedSlash(encodedSlash) });
        index += encodedSlash.length;
      }
      continue;
    }

    buffer += char;
    index += 1;
  }

  if (buffer) parts.push({ type: 'segment', raw: buffer, tokens: [] });
  return parts;
}

function maybeSplitQueryLikePath(url: URL): { pathname: string; queryPrefix: string; searchBody: string } {
  if (url.search) {
    return {
      pathname: url.pathname || '/',
      queryPrefix: '?',
      searchBody: url.search.slice(1),
    };
  }

  const pathname = url.pathname || '/';
  const match = pathname.match(/([&?])([A-Za-z0-9_.~-]+=[^/]*)$/u);
  if (!match) {
    return { pathname, queryPrefix: '', searchBody: '' };
  }

  const splitAt = match.index ?? pathname.length;
  return {
    pathname: pathname.slice(0, splitAt),
    queryPrefix: match[1] ?? '',
    searchBody: pathname.slice(splitAt + 1),
  };
}

function parseQueryFields(searchBody: string): QueryField[] {
  if (!searchBody) return [];

  return searchBody.split('&').map((part, index) => {
    const equalsIndex = part.indexOf('=');
    const hasEquals = equalsIndex >= 0;
    const keyRaw = hasEquals ? part.slice(0, equalsIndex) : part;
    const valueRaw = hasEquals ? part.slice(equalsIndex + 1) : '';
    return {
      type: 'query' as const,
      index,
      hasEquals,
      key: safeDecodeQueryPart(keyRaw),
      keyRaw,
      valueRaw,
      valueTokens: hasEquals ? tokenizeValue(safeDecodeQueryPart(valueRaw)) : [],
    };
  });
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value.replace(/%([0-9a-fA-F]{2})/gu, (match, hex) => {
      try {
        return String.fromCharCode(Number.parseInt(hex, 16));
      } catch {
        return match;
      }
    });
  }
}

function safeDecodePathSegment(value: string): string {
  return safeDecodeURIComponent(value);
}

function safeDecodeQueryPart(value: string): string {
  return safeDecodeURIComponent(value.replaceAll('+', ' '));
}

function normalizeEncodedSlash(value: string): string {
  return /^%2f$/iu.test(value) ? '%2F' : value;
}
