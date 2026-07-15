import type { ImageDisplayRecord } from '../core/display-records.js';
import { DEFAULT_RECENT_HISTORY_SCOPE, type RecentHistoryScope } from '../core/recent-history-scope.js';
import type { PlaintextLocalSettings } from '../data/local-settings.js';

export function recentHistorySiteKey(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return 'unknown';
  }
}

export function recentHistoryPageKey(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return 'unknown';
  }
}

interface RecentHistoryEntry {
  readonly item: ImageDisplayRecord;
  readonly pageKey: string;
  readonly sequence: number;
}

function retainedRecentHistory(items: readonly ImageDisplayRecord[], settings: PlaintextLocalSettings): readonly ImageDisplayRecord[] {
  const limit =
    settings.recentHistoryOverflowBehavior === 'drop-oldest' ? settings.recentHistoryLimit : settings.recentHistoryRetainedLimit;
  return items.slice(0, limit);
}

function visibleRecentHistory(items: readonly ImageDisplayRecord[], settings: PlaintextLocalSettings): readonly ImageDisplayRecord[] {
  return items.slice(0, settings.recentHistoryLimit);
}

/**
 * Per-site cache of recently viewed images, keyed by page hostname. Recents are transient session
 * state (AGENTS.md "Product Model") — this cache is intentionally an in-memory Map only. It must
 * never gain a durable browser-storage write path (tests/invariants.test.ts asserts this).
 */
export class RecentHistoryCache {
  private readonly bySite = new Map<string, readonly RecentHistoryEntry[]>();
  private sequence = 0;

  load(
    pageUrl: string,
    settings: PlaintextLocalSettings,
    includeRetained: boolean,
    scope: RecentHistoryScope = DEFAULT_RECENT_HISTORY_SCOPE,
  ): readonly ImageDisplayRecord[] {
    const entries = this.entriesFor(pageUrl, scope);
    const items = entries.map((entry) => entry.item);
    return includeRetained ? retainedRecentHistory(items, settings) : visibleRecentHistory(items, settings);
  }

  add(
    pageUrl: string,
    item: ImageDisplayRecord,
    settings: PlaintextLocalSettings,
    scope: RecentHistoryScope = DEFAULT_RECENT_HISTORY_SCOPE,
  ): readonly ImageDisplayRecord[] {
    const key = recentHistorySiteKey(pageUrl);
    const entry = { item, pageKey: recentHistoryPageKey(pageUrl), sequence: (this.sequence += 1) };
    const next = [
      entry,
      ...(this.bySite.get(key) ?? []).filter((candidate) => candidate.item.url !== item.url && candidate.item.id !== item.id),
    ].slice(0, retainedLimit(settings));
    this.bySite.set(key, next);
    return this.load(pageUrl, settings, false, scope);
  }

  update(
    pageUrl: string,
    item: ImageDisplayRecord,
    settings: PlaintextLocalSettings,
    scope: RecentHistoryScope = DEFAULT_RECENT_HISTORY_SCOPE,
  ): readonly ImageDisplayRecord[] {
    for (const [key, entries] of this.bySite) {
      const index = entries.findIndex((entry) => entry.item.id === item.id);
      if (index < 0) continue;
      this.bySite.set(
        key,
        entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, item } : entry)),
      );
      break;
    }
    return this.load(pageUrl, settings, false, scope);
  }

  remove(
    pageUrl: string,
    id: string,
    settings: PlaintextLocalSettings,
    scope: RecentHistoryScope = DEFAULT_RECENT_HISTORY_SCOPE,
  ): readonly ImageDisplayRecord[] {
    const pageKey = recentHistoryPageKey(pageUrl);
    const siteKey = recentHistorySiteKey(pageUrl);
    const globalUrls =
      scope === 'all'
        ? new Set(
            this.entriesFor(pageUrl, 'all')
              .filter((entry) => entry.item.id === id)
              .map((entry) => entry.item.url),
          )
        : null;
    for (const [key, entries] of this.bySite) {
      if (scope !== 'all' && key !== siteKey) continue;
      this.bySite.set(
        key,
        entries.filter((entry) => {
          if (scope === 'page' && entry.pageKey !== pageKey) return true;
          return entry.item.id !== id && !globalUrls?.has(entry.item.url);
        }),
      );
    }
    return this.load(pageUrl, settings, false, scope);
  }

  pruneForSettings(settings: PlaintextLocalSettings): void {
    for (const [key, entries] of this.bySite) {
      this.bySite.set(key, entries.slice(0, retainedLimit(settings)));
    }
  }

  /** All cached items across every site, for consumers like blob-reference-counting sweeps. */
  values(): IterableIterator<readonly ImageDisplayRecord[]> {
    return Array.from(this.bySite.values(), (entries) => entries.map((entry) => entry.item)).values();
  }

  private entriesFor(pageUrl: string, scope: RecentHistoryScope): readonly RecentHistoryEntry[] {
    const siteEntries = this.bySite.get(recentHistorySiteKey(pageUrl)) ?? [];
    if (scope === 'site') return siteEntries;
    if (scope === 'page') {
      const pageKey = recentHistoryPageKey(pageUrl);
      return siteEntries.filter((entry) => entry.pageKey === pageKey);
    }
    return uniqueEntries([...this.bySite.values()].flat().sort((left, right) => right.sequence - left.sequence));
  }
}

function uniqueEntries(entries: readonly RecentHistoryEntry[]): readonly RecentHistoryEntry[] {
  const ids = new Set<string>();
  const urls = new Set<string>();
  return entries.filter((entry) => {
    if (ids.has(entry.item.id) || urls.has(entry.item.url)) return false;
    ids.add(entry.item.id);
    urls.add(entry.item.url);
    return true;
  });
}

function retainedLimit(settings: PlaintextLocalSettings): number {
  return settings.recentHistoryOverflowBehavior === 'drop-oldest' ? settings.recentHistoryLimit : settings.recentHistoryRetainedLimit;
}
