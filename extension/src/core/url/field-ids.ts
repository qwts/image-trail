import type { UrlField, UrlFieldLocation, UrlFieldSplitSpec, UrlToken } from './types.js';

export function baseFieldId(location: UrlFieldLocation, containerIndex: number, originalTokenIndex: number): string {
  return `${location === 'path' ? 'p' : 'q'}:${containerIndex}:${originalTokenIndex}`;
}

export function baseFieldIdForField(field: UrlField): string {
  const containerIndex = field.location === 'path' ? field.partIndex : field.queryIndex;
  if (containerIndex === undefined) return field.id;
  return baseFieldId(field.location, containerIndex, field.originalTokenIndex ?? field.tokenIndex);
}

export function baseFieldIdForSplitSpec(spec: UrlFieldSplitSpec): string {
  const containerIndex = spec.location === 'path' ? spec.partIndex : spec.queryIndex;
  return containerIndex === undefined ? spec.baseFieldId : baseFieldId(spec.location, containerIndex, spec.tokenIndex);
}

export function fieldIdForToken(location: UrlFieldLocation, containerIndex: number, tokenIndex: number, token: UrlToken): string {
  const stableBaseId = token.splitBaseId ?? baseFieldId(location, containerIndex, token.originalTokenIndex ?? tokenIndex);
  return token.splitPartIndex === undefined ? stableBaseId : splitFieldId(stableBaseId, token.splitPartIndex);
}

export function splitFieldId(baseId: string, splitPartIndex: number): string {
  return `${baseId}:s:${splitPartIndex}`;
}
