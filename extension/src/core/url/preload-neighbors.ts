import { bumpUrlField, rebuildUrl } from './rebuild-url.js';
import type { ParsedUrlModel, UrlField } from './types.js';

export type NeighborPreloadDirection = -1 | 1;

export interface AdjacentParsedFieldUrlCandidate {
  readonly url: string;
  readonly direction: NeighborPreloadDirection;
  readonly distance: number;
}

export function adjacentParsedFieldUrls(model: ParsedUrlModel, fields: readonly UrlField[], radius: number): readonly string[] {
  return adjacentParsedFieldUrlCandidates(model, fields, radius).map((candidate) => candidate.url);
}

export function skipKnownFailedNeighborCandidate(
  candidates: readonly AdjacentParsedFieldUrlCandidate[],
  direction: NeighborPreloadDirection,
  isKnownFailed: (url: string) => boolean,
): AdjacentParsedFieldUrlCandidate | null {
  let skipped = false;
  const ordered = candidates.filter((candidate) => candidate.direction === direction).sort((a, b) => a.distance - b.distance);
  for (const candidate of ordered) {
    if (isKnownFailed(candidate.url)) {
      skipped = true;
      continue;
    }
    return skipped ? candidate : null;
  }
  return null;
}

export function selectWarmedNeighborCandidate(
  candidates: readonly AdjacentParsedFieldUrlCandidate[],
  direction: NeighborPreloadDirection,
  statusForUrl: (url: string) => 'loaded' | 'failed' | 'unknown',
): AdjacentParsedFieldUrlCandidate | null {
  const ordered = candidates.filter((candidate) => candidate.direction === direction).sort((a, b) => a.distance - b.distance);
  return ordered.find((candidate) => statusForUrl(candidate.url) === 'loaded') ?? null;
}

export function adjacentParsedFieldUrlCandidates(
  model: ParsedUrlModel,
  fields: readonly UrlField[],
  radius: number,
): readonly AdjacentParsedFieldUrlCandidate[] {
  if (!Number.isInteger(radius) || radius <= 0 || fields.length === 0) return [];
  const candidates: AdjacentParsedFieldUrlCandidate[] = [];
  const seen = new Set<string>();
  for (let offset = -radius; offset <= radius; offset += 1) {
    if (offset === 0) continue;
    const direction: NeighborPreloadDirection = offset > 0 ? 1 : -1;
    const distance = Math.abs(offset);
    let nextModel = model;
    for (let step = 0; step < distance; step += 1) {
      nextModel = fields.reduce<ParsedUrlModel>((current, field) => bumpUrlField(current, field, direction), nextModel);
    }
    const url = rebuildUrl(nextModel);
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({ url, direction, distance });
  }
  return candidates;
}

export function fieldsById(fields: readonly UrlField[], fieldIds: readonly string[]): readonly UrlField[] {
  if (fieldIds.length === 0) return [];
  const ids = new Set(fieldIds);
  return fields.filter((field) => ids.has(field.id));
}
