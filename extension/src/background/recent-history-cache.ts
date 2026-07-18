import * as v from 'valibot';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { imageDisplayRecordSchema } from '../core/display-records.schema.js';
import { DEFAULT_RECENT_HISTORY_SCOPE, type RecentHistoryScope } from '../core/recent-history-scope.js';
import type { PlaintextLocalSettings } from '../data/local-settings.js';

const RECENT_HISTORY_SESSION_KEY = 'imageTrail.recentHistory.v1';

export interface RecentHistorySessionStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

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

const recentHistoryEntrySchema = v.object({
  item: imageDisplayRecordSchema,
  pageKey: v.string(),
  sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const recentHistorySessionStateSchema = v.object({
  version: v.literal(1),
  sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  bySite: v.record(v.string(), v.array(recentHistoryEntrySchema)),
});

function retainedRecentHistory(items: readonly ImageDisplayRecord[], settings: PlaintextLocalSettings): readonly ImageDisplayRecord[] {
  const limit =
    settings.recentHistoryOverflowBehavior === 'drop-oldest' ? settings.recentHistoryLimit : settings.recentHistoryRetainedLimit;
  return items.slice(0, limit);
}

function visibleRecentHistory(items: readonly ImageDisplayRecord[], settings: PlaintextLocalSettings): readonly ImageDisplayRecord[] {
  return items.slice(0, settings.recentHistoryLimit);
}

/**
 * Per-site cache of recently viewed images, keyed by page hostname. Recents are transient browser-
 * session state (AGENTS.md "Product Model"). The session adapter survives MV3 worker suspension but
 * must never be backed by durable browser storage (tests/invariants.test.ts asserts the composition).
 */
export class RecentHistoryCache {
  private readonly bySite = new Map<string, readonly RecentHistoryEntry[]>();
  private sequence = 0;
  private readonly hydration: Promise<void>;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly storage?: RecentHistorySessionStorage) {
    this.hydration = this.hydrate();
  }

  ready(): Promise<void> {
    return this.hydration;
  }

  flush(): Promise<void> {
    return this.writes;
  }

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
    this.persist();
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
      this.persist();
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
    this.persist();
    return this.load(pageUrl, settings, false, scope);
  }

  pruneForSettings(settings: PlaintextLocalSettings): void {
    for (const [key, entries] of this.bySite) {
      this.bySite.set(key, entries.slice(0, retainedLimit(settings)));
    }
    this.persist();
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

  private async hydrate(): Promise<void> {
    if (!this.storage) return;
    try {
      const values = await this.storage.get(RECENT_HISTORY_SESSION_KEY);
      const parsed = v.safeParse(recentHistorySessionStateSchema, values[RECENT_HISTORY_SESSION_KEY]);
      if (!parsed.success) return;
      this.sequence = parsed.output.sequence;
      for (const [site, entries] of Object.entries(parsed.output.bySite)) this.bySite.set(site, entries);
    } catch {
      // Session storage is an availability aid; recents still work in memory if it is unavailable.
    }
  }

  private persist(): void {
    if (!this.storage) return;
    const snapshot = {
      version: 1 as const,
      sequence: this.sequence,
      bySite: Object.fromEntries(this.bySite),
    };
    this.writes = this.writes
      .then(() => this.storage?.set({ [RECENT_HISTORY_SESSION_KEY]: snapshot }))
      .then(
        () => undefined,
        () => undefined,
      );
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
