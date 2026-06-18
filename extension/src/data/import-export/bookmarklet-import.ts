import type { DurableBookmarkPayloadV1, RecoverableDataStatus } from '../types.js';

export interface BookmarkletFavorite {
  readonly url: string;
  readonly title?: string;
  readonly label?: string;
  readonly timestamp?: string;
}

export interface BookmarkletJsonPayload {
  readonly favorites?: readonly BookmarkletFavorite[];
  readonly history?: readonly BookmarkletFavorite[];
}

export interface BookmarkletImportResult {
  readonly status: RecoverableDataStatus;
  readonly bookmarks: readonly { uuid: string; payload: DurableBookmarkPayloadV1 }[];
  readonly skipped: readonly string[];
}

export function parseBookmarkletJson(raw: string): BookmarkletJsonPayload {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Bookmarklet data must be a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  return {
    favorites: Array.isArray(obj.favorites) ? obj.favorites.filter(isBookmarkletFavorite) : undefined,
    history: Array.isArray(obj.history) ? obj.history.filter(isBookmarkletFavorite) : undefined,
  };
}

export function importBookmarkletJson(
  raw: string,
  now: string = new Date().toISOString(),
): BookmarkletImportResult {
  let data: BookmarkletJsonPayload;
  try {
    data = parseBookmarkletJson(raw);
  } catch {
    return {
      status: { ok: false, code: 'decryption-failed', message: 'Invalid bookmarklet JSON format.' },
      bookmarks: [],
      skipped: [],
    };
  }

  const allItems = [...(data.favorites ?? []), ...(data.history ?? [])];
  if (allItems.length === 0) {
    return {
      status: { ok: false, code: 'not-found', message: 'No favorites or history entries found in bookmarklet data.' },
      bookmarks: [],
      skipped: [],
    };
  }

  const bookmarks: { uuid: string; payload: DurableBookmarkPayloadV1 }[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const item of allItems) {
    if (!item.url?.trim()) {
      skipped.push(item.title ?? 'unknown');
      continue;
    }

    try {
      new URL(item.url);
    } catch {
      skipped.push(item.url);
      continue;
    }

    if (seen.has(item.url)) continue;
    seen.add(item.url);

    bookmarks.push({
      uuid: crypto.randomUUID(),
      payload: {
        url: item.url,
        title: item.title,
        label: item.label,
        bookmarkedAt: item.timestamp ?? now,
        sourceCompatibility: 'favorites',
      },
    });
  }

  return {
    status: {
      ok: true,
      code: 'ok',
      message: `Imported ${bookmarks.length} bookmark(s)${skipped.length ? `, skipped ${skipped.length}` : ''}.`,
    },
    bookmarks,
    skipped,
  };
}

function isBookmarkletFavorite(value: unknown): value is BookmarkletFavorite {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.url === 'string';
}
