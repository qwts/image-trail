import type { ImageDisplayRecord } from '../core/display-records.js';

export function clampPageOffset(offset: number, limit: number, total: number): number {
  if (total <= 0) return 0;
  const lastPageOffset = Math.floor((total - 1) / limit) * limit;
  return Math.min(offset, lastPageOffset);
}

export function filterByVisibilityScope(
  records: readonly ImageDisplayRecord[],
  scope: 'global' | 'site',
  currentPageUrl: string | undefined,
): readonly ImageDisplayRecord[] {
  return records.filter((record) => isVisibleInScope(record, scope, currentPageUrl));
}

export function isVisibleInScope(record: ImageDisplayRecord, scope: 'global' | 'site', currentPageUrl: string | undefined): boolean {
  if (scope !== 'site' || !currentPageUrl) return true;
  const currentHostname = hostnameFromUrl(currentPageUrl);
  if (!currentHostname) return true;
  return hostnameFromUrl(record.url) === currentHostname;
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function dataUrlToBytes(dataUrl: string): { readonly mimeType: string; readonly bytes: ArrayBuffer } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[2]!.replace(/\s/gu, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return { mimeType: match[1]!.toLowerCase(), bytes: bytes.buffer };
  } catch {
    return null;
  }
}
