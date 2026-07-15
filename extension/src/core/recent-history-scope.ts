export type RecentHistoryScope = 'page' | 'site' | 'all';

export const DEFAULT_RECENT_HISTORY_SCOPE: RecentHistoryScope = 'site';

export function isRecentHistoryScope(value: unknown): value is RecentHistoryScope {
  return value === 'page' || value === 'site' || value === 'all';
}
