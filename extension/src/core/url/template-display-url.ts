import { setUrlFieldValue } from './rebuild-url.js';
import { tokenValue } from './tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from './types.js';

export function templateUrlForFields(model: ParsedUrlModel, fields: readonly UrlField[]): string {
  const templated = fields.reduce<ParsedUrlModel>(
    (nextModel, field) => setUrlFieldValue(nextModel, field, templateFieldPlaceholder(field)),
    model,
  );
  const includedPathTokens = includedTokenIndexes(fields, 'path');
  const path = templated.pathParts
    .map((part, partIndex) => {
      if (part.type === 'sep') return part.raw;
      const tokenIndexes = includedPathTokens.get(partIndex);
      if (!tokenIndexes) return '{path-segment}';
      return encodePathTemplateSegment(
        part.tokens.map((token, tokenIndex) => (tokenIndexes.has(tokenIndex) ? tokenValue(token) : '{path-literal}')).join(''),
      );
    })
    .join('');
  const includedQueryTokens = includedTokenIndexes(fields, 'query');
  const query = templated.queryFields
    .filter((field) => includedQueryTokens.has(field.index))
    .map((field) => {
      const key = encodeQueryKey(field.key);
      if (!field.hasEquals) return key;
      const tokenIndexes = includedQueryTokens.get(field.index);
      return `${key}=${encodeQueryTemplateValue(
        field.valueTokens.map((token, tokenIndex) => (tokenIndexes?.has(tokenIndex) ? tokenValue(token) : '{query-literal}')).join(''),
      )}`;
    })
    .join('&');
  const normalizedPath = path || '/';
  const normalizedQuery = query ? `${model.queryPrefix || '?'}${query}` : '';
  return `${model.protocol}//${model.host}${normalizedPath}${normalizedQuery}`;
}

export function templateFieldPlaceholder(field: UrlField): string {
  const key = field.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
  return `{${key || field.id}}`;
}

function includedTokenIndexes(fields: readonly UrlField[], location: UrlField['location']): Map<number, Set<number>> {
  const indexesByContainer = new Map<number, Set<number>>();
  for (const field of fields) {
    if (field.location !== location) continue;
    const containerIndex = location === 'path' ? field.partIndex : field.queryIndex;
    if (containerIndex === undefined) continue;
    const indexes = indexesByContainer.get(containerIndex) ?? new Set<number>();
    indexes.add(field.tokenIndex);
    indexesByContainer.set(containerIndex, indexes);
  }
  return indexesByContainer;
}

function encodePathTemplateSegment(value: string): string {
  return encodeURIComponent(value)
    .replaceAll('%26', '&')
    .replaceAll('%3D', '=')
    .replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%7B([^%]+)%7D/giu, '{$1}');
}

function encodeQueryTemplateValue(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replaceAll('%20', '+')
    .replace(/%7B([^%]+)%7D/giu, '{$1}');
}

function encodeQueryKey(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
