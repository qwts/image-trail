import { DEFAULT_RECENT_HISTORY_SCOPE, isRecentHistoryScope, type RecentHistoryScope } from '../../core/recent-history-scope.js';

export function createRecentScopeControl(
  scope: RecentHistoryScope = DEFAULT_RECENT_HISTORY_SCOPE,
  pageUrl: string,
  privacyMode: boolean,
  dispatch: (scope: RecentHistoryScope) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'image-trail-panel__record-sort-select image-trail-panel__recent-scope-select';
  select.setAttribute('aria-label', 'Recents scope');
  select.append(
    createOption('page', recentPageLabel(pageUrl, privacyMode)),
    createOption('site', recentSiteLabel(pageUrl, privacyMode)),
    createOption('all', 'All sites'),
  );
  select.value = scope;
  select.addEventListener('change', () => {
    if (isRecentHistoryScope(select.value)) dispatch(select.value);
  });
  return select;
}

export function recentHistoryEmptyText(scope: RecentHistoryScope): string {
  if (scope === 'page') return 'Images loaded on this page will appear here newest-first.';
  if (scope === 'all') return 'Images loaded across sites will appear here newest-first.';
  return 'Images loaded on this site will appear here newest-first.';
}

function recentPageLabel(pageUrl: string, privacyMode: boolean): string {
  if (privacyMode) return 'Current page';
  try {
    return `Page: ${new URL(pageUrl).pathname}`;
  } catch {
    return 'Current page';
  }
}

function recentSiteLabel(pageUrl: string, privacyMode: boolean): string {
  if (privacyMode) return 'Current site';
  try {
    return `Site: ${new URL(pageUrl).hostname}`;
  } catch {
    return 'Current site';
  }
}

function createOption(value: RecentHistoryScope, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}
