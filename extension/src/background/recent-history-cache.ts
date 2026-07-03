import type { ImageDisplayRecord } from '../core/display-records.js';
import type { PlaintextLocalSettings } from '../data/local-settings.js';

const MAX_RECENT_HISTORY_ITEMS = 200;

export function recentHistoryKey(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return 'unknown';
  }
}

function retainedRecentHistory(items: readonly ImageDisplayRecord[], settings: PlaintextLocalSettings): readonly ImageDisplayRecord[] {
  const limit = settings.recentHistoryOverflowBehavior === 'drop-oldest' ? settings.recentHistoryLimit : MAX_RECENT_HISTORY_ITEMS;
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
  private readonly bySite = new Map<string, readonly ImageDisplayRecord[]>();

  load(pageUrl: string, settings: PlaintextLocalSettings, includeRetained: boolean): readonly ImageDisplayRecord[] {
    const retained = this.bySite.get(recentHistoryKey(pageUrl)) ?? [];
    return includeRetained ? retained : visibleRecentHistory(retained, settings);
  }

  add(pageUrl: string, item: ImageDisplayRecord, settings: PlaintextLocalSettings): readonly ImageDisplayRecord[] {
    const key = recentHistoryKey(pageUrl);
    const next = retainedRecentHistory(
      [item, ...(this.bySite.get(key) ?? []).filter((entry) => entry.url !== item.url && entry.id !== item.id)],
      settings,
    );
    this.bySite.set(key, next);
    return visibleRecentHistory(next, settings);
  }

  remove(pageUrl: string, id: string, settings: PlaintextLocalSettings): readonly ImageDisplayRecord[] {
    const key = recentHistoryKey(pageUrl);
    const next = (this.bySite.get(key) ?? []).filter((entry) => entry.id !== id);
    this.bySite.set(key, next);
    return visibleRecentHistory(next, settings);
  }

  pruneForSettings(settings: PlaintextLocalSettings): void {
    if (settings.recentHistoryOverflowBehavior !== 'drop-oldest') return;
    for (const [key, items] of this.bySite) {
      this.bySite.set(key, retainedRecentHistory(items, settings));
    }
  }

  /** All cached items across every site, for consumers like blob-reference-counting sweeps. */
  values(): IterableIterator<readonly ImageDisplayRecord[]> {
    return this.bySite.values();
  }
}
