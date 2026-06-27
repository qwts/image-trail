import { sourceImageUrlFrom } from '../display-records.js';

export type RestoreDuplicateMatch = 'sha256' | 'url';

export interface RestoreDuplicateCandidate {
  readonly id: string;
  readonly url: string;
  readonly sha256?: string;
}

export interface RestoreDuplicateRecord {
  readonly id: string;
  readonly url: string;
  readonly sha256?: string;
}

export interface RestoreDuplicateClassification<T extends RestoreDuplicateCandidate> {
  readonly candidate: T;
  readonly duplicate?: {
    readonly existingId: string;
    readonly matchedBy: RestoreDuplicateMatch;
  };
}

export function classifyRestoreDuplicates<T extends RestoreDuplicateCandidate>(
  candidates: readonly T[],
  existingRecords: readonly RestoreDuplicateRecord[],
): readonly RestoreDuplicateClassification<T>[] {
  const existingBySha256 = new Map<string, RestoreDuplicateRecord>();
  const existingByUrl = new Map<string, RestoreDuplicateRecord>();

  for (const record of existingRecords) {
    const sha256 = safeSha256(record.sha256);
    if (sha256 && !existingBySha256.has(sha256)) existingBySha256.set(sha256, record);
    const url = normalizedRestoreSourceUrl(record.url);
    if (url && !existingByUrl.has(url)) existingByUrl.set(url, record);
  }

  return candidates.map((candidate) => {
    const sha256 = safeSha256(candidate.sha256);
    const sha256Match = sha256 ? existingBySha256.get(sha256) : undefined;
    if (sha256Match) {
      return { candidate, duplicate: { existingId: sha256Match.id, matchedBy: 'sha256' } };
    }

    const urlMatch = existingByUrl.get(normalizedRestoreSourceUrl(candidate.url));
    if (urlMatch) {
      return { candidate, duplicate: { existingId: urlMatch.id, matchedBy: 'url' } };
    }

    return { candidate };
  });
}

export function normalizedRestoreSourceUrl(url: string): string {
  try {
    return sourceImageUrlFrom(url).href;
  } catch {
    try {
      return new URL(url).href;
    } catch {
      return url.trim();
    }
  }
}

function safeSha256(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[0-9a-f]{64}$/u.test(normalized) ? normalized : null;
}
