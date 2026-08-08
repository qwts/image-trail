import { useCallback, useEffect, useMemo, useState } from 'react';

import type { UrlReviewStatus, UrlReviewStatusRecord } from '../core/types.js';
import type { DestinationServices } from './destination-services.js';
import { useRequestGeneration } from './request-generation.js';
import { SettingField, SettingNote, SettingsGroup } from './settings-shared.js';

type StatusFilter = 'all' | UrlReviewStatus;

interface ReviewHistoryState {
  readonly records: readonly UrlReviewStatusRecord[];
  readonly busy: boolean;
  readonly error: string | null;
}

export interface UrlReviewTimeSpan {
  readonly first: string;
  readonly last: string;
  readonly elapsedMs: number;
}

interface SiteOption {
  readonly key: string;
  readonly hostname: string;
  readonly label: string;
}

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'unchanged', label: 'Unchanged' },
];

export function urlReviewTimeSpan(records: readonly UrlReviewStatusRecord[]): UrlReviewTimeSpan | null {
  const parsed = records
    .map((record) => ({ raw: record.updatedAt, ms: Date.parse(record.updatedAt) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => a.ms - b.ms);
  const first = parsed[0]?.raw;
  const last = parsed.at(-1)?.raw;
  if (!first || !last) return null;
  const elapsedMs = Math.max(0, parsed.at(-1)!.ms - parsed[0]!.ms);
  return { first, last, elapsedMs };
}

export function filterUrlReviewStatus(
  records: readonly UrlReviewStatusRecord[],
  hostname: string | null,
  status: StatusFilter,
): readonly UrlReviewStatusRecord[] {
  return records.filter((record) => (hostname === null || record.hostname === hostname) && (status === 'all' || record.status === status));
}

function useReviewHistory(services: DestinationServices) {
  const [state, setState] = useState<ReviewHistoryState>({ records: [], busy: true, error: null });
  const requests = useRequestGeneration();
  const load = useCallback(async () => {
    const request = requests.begin();
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const records = await services.loadUrlReviewStatus();
      if (requests.isCurrent(request)) setState({ records, busy: false, error: null });
    } catch {
      if (requests.isCurrent(request))
        setState((current) => ({ ...current, busy: false, error: 'URL review history could not be loaded.' }));
    }
  }, [requests, services]);
  useEffect(() => void load(), [load]);
  return { ...state, reload: load };
}

function siteOptions(records: readonly UrlReviewStatusRecord[], privacyMode: boolean): readonly SiteOption[] {
  return [...new Set(records.map((record) => record.hostname))]
    .sort((left, right) => left.localeCompare(right))
    .map((hostname, index) => ({
      key: `site-${index + 1}`,
      hostname,
      label: privacyMode ? `Private site ${index + 1}` : hostname,
    }));
}

function formatTimestamp(timestamp: string): string {
  return timestamp.replace('T', ' ').replace('.000Z', 'Z');
}

export function formatReviewElapsed(elapsedMs: number): string {
  if (elapsedMs < 60_000) return 'under 1 minute';
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}${remainingMinutes ? ` ${remainingMinutes} min` : ''}`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const remainingAfterDaysMinutes = minutes - days * 24 * 60 - remainingHours * 60;
  if (remainingHours) {
    return `${days} day${days === 1 ? '' : 's'}${remainingHours ? ` ${remainingHours} hr` : ''}${remainingAfterDaysMinutes ? ` ${remainingAfterDaysMinutes} min` : ''}`;
  }
  return `${days} day${days === 1 ? '' : 's'}${remainingAfterDaysMinutes ? ` ${remainingAfterDaysMinutes} min` : ''}`;
}

function ReviewSpan({ records, privacyMode }: { readonly records: readonly UrlReviewStatusRecord[]; readonly privacyMode: boolean }) {
  const span = urlReviewTimeSpan(records);
  if (!span) return <p className="image-trail-destination-page__empty">No URL review records match these filters.</p>;
  if (privacyMode) {
    return (
      <div className="image-trail-url-review__span" data-privacy="true">
        <strong>{records.length} matching review records</strong>
        <span>Exact review timing is hidden in Privacy Mode.</span>
      </div>
    );
  }
  return (
    <div className="image-trail-url-review__span">
      <strong>{records.length} matching review records</strong>
      <span>First reviewed: {formatTimestamp(span.first)}</span>
      <span>Last reviewed: {formatTimestamp(span.last)}</span>
      <span>Elapsed span: {formatReviewElapsed(span.elapsedMs)}</span>
    </div>
  );
}

function ReviewRecord({ record, privacyMode }: { readonly record: UrlReviewStatusRecord; readonly privacyMode: boolean }) {
  const fieldDetail = record.fieldIds.length ? record.fieldIds.join(', ') : 'No field ids recorded';
  return (
    <li className="image-trail-url-review__record" data-status={record.status} data-privacy={privacyMode ? 'true' : 'false'}>
      <header>
        <strong>{record.status}</strong>
        <span>{privacyMode ? 'Review time hidden' : formatTimestamp(record.updatedAt)}</span>
      </header>
      <dl>
        <dt>Source</dt>
        <dd>{privacyMode ? 'Private source URL' : record.sourceUrl}</dd>
        <dt>Page / site</dt>
        <dd>{privacyMode ? 'Private page and site' : `${record.pageUrl} · ${record.hostname}`}</dd>
        <dt>Fields</dt>
        <dd>
          {privacyMode
            ? `${record.fieldIds.length} reviewed field${record.fieldIds.length === 1 ? '' : 's'}`
            : `${fieldDetail}${record.activeFieldId ? ` · active ${record.activeFieldId}` : ''}`}
        </dd>
        <dt>Reason</dt>
        <dd>{privacyMode ? 'Review detail hidden' : (record.reason ?? 'No reason recorded.')}</dd>
      </dl>
    </li>
  );
}

export function UrlReviewStatusSettingsGroup({
  services,
  privacyMode,
}: {
  readonly services: DestinationServices;
  readonly privacyMode: boolean;
}) {
  const history = useReviewHistory(services);
  const sites = useMemo(() => siteOptions(history.records, privacyMode), [history.records, privacyMode]);
  const [selectedHostname, setSelectedHostname] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const selectedSite = sites.find((site) => site.hostname === selectedHostname) ?? null;
  const siteKey = selectedSite?.key ?? 'all';
  const visible = filterUrlReviewStatus(history.records, selectedHostname, status);
  const PAGE_SIZE = 100;
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  useEffect(() => {
    setPageSize(PAGE_SIZE);
  }, [selectedHostname, status, history.records.length]);
  const paged = visible.slice(0, pageSize);
  useEffect(() => {
    if (selectedHostname !== null && !selectedSite) setSelectedHostname(null);
  }, [selectedHostname, selectedSite]);

  return (
    <SettingsGroup title="URL review history">
      <SettingNote>
        Read-only URL review metadata supports export and clear decisions. It does not read Recents, Queue, Recall, downloads, thumbnails,
        or original bytes.
      </SettingNote>
      <div className="image-trail-url-review__controls">
        <SettingField label="Site">
          <select
            aria-label="URL review site"
            value={siteKey}
            onChange={(event) => setSelectedHostname(sites.find((site) => site.key === event.currentTarget.value)?.hostname ?? null)}
          >
            <option value="all">All sites</option>
            {sites.map((site) => (
              <option key={site.key} value={site.key}>
                {site.label}
              </option>
            ))}
          </select>
        </SettingField>
        <SettingField label="Status">
          <select aria-label="URL review status" value={status} onChange={(event) => setStatus(event.currentTarget.value as StatusFilter)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingField>
        <button type="button" disabled={history.busy} onClick={() => void history.reload()}>
          {history.busy ? 'Loading…' : 'Reload review history'}
        </button>
      </div>
      {history.error ? (
        <p className="image-trail-destination-page__status is-error" role="alert">
          {history.error}
        </p>
      ) : (
        <>
          <ReviewSpan records={visible} privacyMode={privacyMode} />
          <ol className="image-trail-url-review__records">
            {paged.map((record) => (
              <ReviewRecord key={`${record.hostname}:${record.sourceUrl}`} record={record} privacyMode={privacyMode} />
            ))}
          </ol>
          {visible.length > paged.length ? (
            <button type="button" onClick={() => setPageSize((n) => n + PAGE_SIZE)}>
              Load more ({visible.length - paged.length} remaining)
            </button>
          ) : null}
        </>
      )}
    </SettingsGroup>
  );
}
