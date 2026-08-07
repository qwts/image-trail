import { detectNumericType, tokenValue } from './tokenize-fields.js';
import type { ParsedUrlModel, UrlField, UrlToken } from './types.js';

export function rebuildUrl(model: ParsedUrlModel): string {
  const path = rebuildPath(model);
  const query = model.queryFields.length > 0 ? `${model.queryPrefix || '?'}${model.queryFields.map(rebuildQueryField).join('&')}` : '';
  return `${model.protocol}//${model.host}${path}${query}${model.hash}`;
}

export function bumpUrlField(model: ParsedUrlModel, field: UrlField, delta: number): ParsedUrlModel {
  return setUrlFieldToken(model, field, (token) => bumpToken(token, delta), delta);
}

export function setUrlFieldValue(model: ParsedUrlModel, field: UrlField, nextValue: string): ParsedUrlModel {
  const normalized = normalizeTokenValue(nextValue);
  return setUrlFieldToken(model, field, (token) => setTokenValue(token, normalized));
}

export function rebuildUrlWithRawFieldValue(model: ParsedUrlModel, field: UrlField, nextValue: string): string {
  if (field.splitBaseId) return rebuildUrl(setUrlFieldValue(model, field, nextValue));
  const currentUrl = rebuildUrl(model);
  let marker = '__IMAGE_TRAIL_RAW_FIELD_VALUE__';
  while (currentUrl.includes(marker)) marker += '_';
  const markedUrl = rebuildUrl(setUrlFieldValue(model, field, marker));
  return markedUrl.replace(marker, normalizeTokenValue(nextValue));
}

function setUrlFieldToken(
  model: ParsedUrlModel,
  field: UrlField,
  update: (token: UrlToken) => UrlToken,
  splitDelta?: number,
): ParsedUrlModel {
  if (field.location === 'path' && field.partIndex !== undefined) {
    return {
      ...model,
      pathParts: model.pathParts.map((part, partIndex) =>
        partIndex === field.partIndex && part.type === 'segment'
          ? {
              ...part,
              edited: true,
              tokens: updateFieldTokens(part.tokens, field, update, splitDelta),
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
              valueTokens: updateFieldTokens(queryField.valueTokens, field, update, splitDelta),
            }
          : queryField,
      ),
    };
  }

  return model;
}

function updateFieldTokens(
  tokens: readonly UrlToken[],
  field: UrlField,
  update: (token: UrlToken) => UrlToken,
  splitDelta?: number,
): UrlToken[] {
  if (!field.splitBaseId) return tokens.map((token, tokenIndex) => (tokenIndex === field.tokenIndex ? update(token) : token));

  const target = tokens[field.tokenIndex];
  if (!target || target.kind === 'text' || target.prefix) {
    return tokens.map((token, tokenIndex) => (tokenIndex === field.tokenIndex ? update(token) : token));
  }

  const group = tokens
    .map((token, tokenIndex) => ({ token, tokenIndex }))
    .filter(({ token }) => token.splitBaseId === field.splitBaseId && token.originalTokenIndex === target.originalTokenIndex);
  const targetGroupIndex = group.findIndex(({ tokenIndex }) => tokenIndex === field.tokenIndex);
  if (group.length < 2 || targetGroupIndex === -1) {
    return tokens.map((token, tokenIndex) => (tokenIndex === field.tokenIndex ? update(token) : token));
  }

  const currentParts = group.map(({ token }) => tokenValue(token));
  const currentRaw = currentParts.join('');
  const prefix = /^0[xX]/u.exec(currentRaw)?.[0] ?? '';
  const targetOffset = currentParts.slice(0, targetGroupIndex).reduce((sum, part) => sum + part.length, 0);
  if (targetOffset < prefix.length) return [...tokens];
  const currentWholeDigits = currentRaw.slice(prefix.length);
  const currentRadix = prefix || /[a-f]/iu.test(currentWholeDigits) ? 16 : 10;
  const targetForUpdate =
    currentRadix === 16 && target.kind === 'int'
      ? { ...target, kind: 'hex' as const, uppercase: /[A-F]/u.test(currentWholeDigits) }
      : target;
  const updatedTarget = update(targetForUpdate);
  if (updatedTarget.kind === 'text' || updatedTarget.prefix) {
    return tokens.map((token, tokenIndex) => (tokenIndex === field.tokenIndex ? updatedTarget : token));
  }
  const radix = currentRadix === 16 || updatedTarget.kind === 'hex' ? 16 : 10;
  const currentTarget = parseNumericTokenValue(currentParts[targetGroupIndex]!, radix);
  const nextTarget = parseNumericTokenValue(tokenValue(updatedTarget), radix);
  const currentWhole = parseNumericTokenValue(currentWholeDigits, radix);
  if (currentTarget === null || nextTarget === null || currentWhole === null) {
    return tokens.map((token, tokenIndex) => (tokenIndex === field.tokenIndex ? updatedTarget : token));
  }

  const suffixWidth = currentParts.slice(targetGroupIndex + 1).reduce((sum, part) => sum + part.length, 0);
  const place = BigInt(radix) ** BigInt(suffixWidth);
  const totalWidth = currentWholeDigits.length;
  const maximum = BigInt(radix) ** BigInt(totalWidth) - 1n;
  const requestedDelta = splitDelta === undefined ? nextTarget - currentTarget : BigInt(splitDelta);
  const arithmetic = currentWhole + requestedDelta * place;
  const bounded = arithmetic < 0n ? 0n : arithmetic > maximum ? maximum : arithmetic;
  const nextWhole = bounded.toString(radix).padStart(totalWidth, '0');
  const casedWhole = radix === 16 ? preserveHexCase(currentWholeDigits, nextWhole, updatedTarget.uppercase === true) : nextWhole;
  const nextRaw = `${prefix}${casedWhole}`;

  let cursor = 0;
  const replacements = new Map<number, UrlToken>();
  for (const { token, tokenIndex } of group) {
    const width = tokenValue(token).length;
    const value = nextRaw.slice(cursor, cursor + width);
    cursor += width;
    replacements.set(tokenIndex, { ...token, ...setTokenValue(token, value) });
  }
  return tokens.map((token, tokenIndex) => replacements.get(tokenIndex) ?? token);
}

function preserveHexCase(current: string, next: string, uppercaseChanges: boolean): string {
  return [...next]
    .map((digit, index) => {
      const previous = current[index];
      if (previous?.toLowerCase() === digit.toLowerCase()) return previous;
      return uppercaseChanges ? digit.toUpperCase() : digit.toLowerCase();
    })
    .join('');
}

function parseNumericTokenValue(value: string, radix: 10 | 16): bigint | null {
  const pattern = radix === 16 ? /^[\da-f]+$/iu : /^\d+$/u;
  if (!pattern.test(value)) return null;
  return BigInt(radix === 16 ? `0x${value}` : value);
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
