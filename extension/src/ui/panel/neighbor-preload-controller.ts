import { imageResourceUrlsEqual } from '../../core/image/image-navigation.js';
import type { ImageRequestIntent } from '../../core/image/request-policy.js';
import {
  adjacentParsedFieldUrlCandidates,
  fieldsById,
  type AdjacentParsedFieldUrlCandidate,
  type NeighborPreloadDirection,
} from '../../core/url/preload-neighbors.js';
import { collectUrlFields } from '../../core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField, UrlFieldDigitWidthSpec, UrlFieldSplitSpec } from '../../core/url/types.js';
import type { fetchThumbnailSource } from '../../content/thumbnail-generator.js';
import { RequestGovernor } from '../../content/request-governor.js';

export const NEIGHBOR_PRELOAD_FILL_SCAN_LIMIT = 50;
const NEIGHBOR_PRELOAD_MINIMUM_INTERVAL_MS = 250;
const MAX_NEIGHBOR_PRELOAD_REQUESTS_PER_MINUTE = 20;

type NeighborPreloadCacheEntry =
  | { readonly status: 'loaded'; readonly displayUrl: string; readonly sha256: string | null }
  | { readonly status: 'failed'; readonly message: string };

type FetchThumbnailResult = Awaited<ReturnType<typeof fetchThumbnailSource>>;

type PreloadResult =
  | { readonly ok: true; readonly displayUrl: string; readonly sha256: string | null }
  | { readonly ok: false; readonly message: string };

export interface NeighborPreloadLocalSettings {
  readonly neighborPreloadEnabled: boolean;
  readonly neighborPreloadRadius: number;
  readonly neighborPreloadCacheLimit: number;
}

interface FieldContextKeyParts {
  readonly fieldSplitSpecs: readonly UrlFieldSplitSpec[];
  readonly fieldDigitWidthSpecs: readonly UrlFieldDigitWidthSpec[];
  readonly selectedHandleId: string | null;
}

export interface NeighborPreloadControllerDeps {
  getLocalSettings(): NeighborPreloadLocalSettings;
  currentNavigationBaseRawUrl(): string;
  currentNavigationBaseModel(): ParsedUrlModel;
  currentPageHref(): string;
  isNavigableQueryField(field: UrlField): boolean;
  currentFieldContextKeyParts(): FieldContextKeyParts;
  fetchThumbnail(
    url: string,
    options: { readonly intent?: ImageRequestIntent; readonly contextKey?: string },
  ): Promise<FetchThumbnailResult>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function imageLoadFailureMessage(message: string): string {
  return message.startsWith('Image failed to load: ') ? message : `Image failed to load: ${message}`;
}

export class NeighborPreloadController {
  private readonly governor = new RequestGovernor({
    minimumIntervalMs: NEIGHBOR_PRELOAD_MINIMUM_INTERVAL_MS,
    maxRequests: MAX_NEIGHBOR_PRELOAD_REQUESTS_PER_MINUTE,
    windowMs: 60_000,
  });
  private readonly cache = new Map<string, NeighborPreloadCacheEntry>();
  private readonly inflight = new Map<string, Promise<boolean>>();
  private currentRunId = 0;

  constructor(private readonly deps: NeighborPreloadControllerDeps) {}

  get isActive(): boolean {
    const settings = this.deps.getLocalSettings();
    return settings.neighborPreloadEnabled && settings.neighborPreloadRadius > 0;
  }

  get runId(): number {
    return this.currentRunId;
  }

  async preload(
    url: string,
    options: {
      readonly readCache?: boolean;
      readonly writeCache?: boolean;
      readonly intent?: ImageRequestIntent;
      readonly contextKey?: string;
    } = {},
  ): Promise<PreloadResult> {
    const cached = options.readCache !== false && this.isActive ? this.cache.get(url) : undefined;
    if (cached?.status === 'loaded') return { ok: true, displayUrl: cached.displayUrl, sha256: cached.sha256 };
    if (cached?.status === 'failed') return { ok: false, message: cached.message };
    if (url.startsWith('data:image/')) return { ok: true, displayUrl: url, sha256: null };
    const result = await this.deps.fetchThumbnail(url, { intent: options.intent, contextKey: options.contextKey });
    if (!result.ok) return { ok: false, message: `Image failed to load: ${result.message}` };
    const loaded = { displayUrl: result.dataUrl, sha256: result.sha256 ?? null };
    if (options.writeCache !== false && this.isActive) this.remember(url, loaded);
    return { ok: true, ...loaded };
  }

  preloadMore(model: ParsedUrlModel, fields: readonly UrlField[]): { readonly candidateCount: number } | null {
    if (!this.isActive) return null;
    const candidates = ([-1, 1] as const).flatMap((direction) => this.additionalCandidates(model, fields, direction));
    if (candidates.length === 0) return null;
    const runId = this.currentRunId;
    void this.runBatch(
      candidates,
      runId,
      fields.map((field) => field.id),
    );
    return { candidateCount: candidates.length };
  }

  getCachedFingerprint(url: string): string | null {
    const cached = this.cache.get(url);
    return cached?.status === 'loaded' ? cached.sha256 : null;
  }

  invalidate(): void {
    this.currentRunId += 1;
    this.cache.clear();
  }

  dispose(): void {
    this.invalidate();
    this.inflight.clear();
  }

  pruneCache(): void {
    const limit = this.deps.getLocalSettings().neighborPreloadCacheLimit;
    if (limit === 0) return;
    while (this.cache.size > limit) {
      const oldest = this.cache.keys().next().value;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
  }

  private fillCandidates(
    model: ParsedUrlModel,
    fields: readonly UrlField[],
    direction: NeighborPreloadDirection,
  ): readonly AdjacentParsedFieldUrlCandidate[] {
    const targetCount = this.deps.getLocalSettings().neighborPreloadRadius;
    if (targetCount <= 0 || fields.length === 0) return [];
    const baseUrl = this.deps.currentNavigationBaseRawUrl();
    const pageHref = this.deps.currentPageHref();
    const candidates = adjacentParsedFieldUrlCandidates(model, fields, NEIGHBOR_PRELOAD_FILL_SCAN_LIMIT)
      .filter((candidate) => candidate.direction === direction)
      .sort((a, b) => a.distance - b.distance);
    const selected: AdjacentParsedFieldUrlCandidate[] = [];
    let buffered = 0;
    for (const candidate of candidates) {
      if (imageResourceUrlsEqual(candidate.url, baseUrl, pageHref)) continue;
      const cached = this.cache.get(candidate.url);
      if (cached?.status === 'failed') continue;
      if (cached?.status === 'loaded' || this.inflight.has(candidate.url)) {
        buffered += 1;
      } else {
        selected.push(candidate);
        buffered += 1;
      }
      if (buffered >= targetCount) break;
    }
    return selected;
  }

  private additionalCandidates(
    model: ParsedUrlModel,
    fields: readonly UrlField[],
    direction: NeighborPreloadDirection,
  ): readonly AdjacentParsedFieldUrlCandidate[] {
    const targetCount = this.deps.getLocalSettings().neighborPreloadRadius;
    if (targetCount <= 0 || fields.length === 0) return [];
    const baseUrl = this.deps.currentNavigationBaseRawUrl();
    const pageHref = this.deps.currentPageHref();
    const candidates = adjacentParsedFieldUrlCandidates(model, fields, NEIGHBOR_PRELOAD_FILL_SCAN_LIMIT)
      .filter((candidate) => candidate.direction === direction)
      .sort((a, b) => a.distance - b.distance);
    const selected: AdjacentParsedFieldUrlCandidate[] = [];
    for (const candidate of candidates) {
      if (imageResourceUrlsEqual(candidate.url, baseUrl, pageHref)) continue;
      if (this.cache.has(candidate.url) || this.inflight.has(candidate.url)) continue;
      selected.push(candidate);
      if (selected.length >= targetCount) break;
    }
    return selected;
  }

  private async runBatch(
    candidates: readonly AdjacentParsedFieldUrlCandidate[],
    runId: number,
    attemptedFieldIds: readonly string[],
  ): Promise<void> {
    const tasks: Promise<boolean>[] = [];
    preloadCandidates: for (const candidate of candidates) {
      if (runId !== this.currentRunId || !this.isActive) break;
      if (this.cache.has(candidate.url) || this.inflight.has(candidate.url)) continue;
      while (runId === this.currentRunId && this.isActive) {
        const result = this.governor.request(() => this.loadOne(candidate, runId, attemptedFieldIds));
        if (result.status === 'ok') {
          tasks.push(result.value);
          continue preloadCandidates;
        }
        if (result.status === 'capped') break preloadCandidates;
        await delay(NEIGHBOR_PRELOAD_MINIMUM_INTERVAL_MS);
      }
      break;
    }
    await Promise.allSettled(tasks);
  }

  private topUp(attemptedFieldIds: readonly string[], direction: NeighborPreloadDirection, runId: number): void {
    if (runId !== this.currentRunId || !this.isActive) return;
    let model: ParsedUrlModel;
    try {
      model = this.deps.currentNavigationBaseModel();
    } catch {
      return;
    }
    const fields = fieldsById(collectUrlFields(model), attemptedFieldIds).filter((field) => this.deps.isNavigableQueryField(field));
    const candidates = this.fillCandidates(model, fields, direction);
    if (candidates.length === 0) return;
    void this.runBatch(candidates, runId, attemptedFieldIds);
  }

  private requestContextKey(direction: NeighborPreloadDirection, runId: number, attemptedFieldIds: readonly string[]): string {
    const parts = this.deps.currentFieldContextKeyParts();
    return [
      'neighbor-preload',
      String(runId),
      this.deps.currentNavigationBaseRawUrl(),
      attemptedFieldIds.join(','),
      parts.fieldSplitSpecs.map((spec) => `${spec.baseFieldId}:${spec.pattern}`).join('|'),
      parts.fieldDigitWidthSpecs.map((spec) => `${spec.fieldId}:${spec.width}:${spec.sourceWidth ?? ''}`).join('|'),
      parts.selectedHandleId ?? '',
      String(direction),
    ].join('\n');
  }

  private async loadOne(candidate: AdjacentParsedFieldUrlCandidate, runId: number, attemptedFieldIds: readonly string[]): Promise<boolean> {
    // dispose() can clear `inflight` while this call is still pending (e.g. a BFCache
    // pagehide/resume cycle reuses the same controller instance). Only clear the map
    // entry that this call itself owns, so a stale settlement can never evict a newer
    // in-flight entry that a later call registered under the same URL.
    const promise: Promise<boolean> = this.preload(candidate.url, {
      readCache: false,
      writeCache: false,
      intent: 'field-active-navigation',
      contextKey: this.requestContextKey(candidate.direction, runId, attemptedFieldIds),
    })
      .then((result) => {
        if (runId !== this.currentRunId || !this.isActive || !result.ok) {
          if (runId === this.currentRunId && this.isActive && !result.ok) {
            this.rememberFailure(candidate.url, result.message);
            this.clearInflightIfCurrent(candidate.url, promise);
            this.topUp(attemptedFieldIds, candidate.direction, runId);
          }
          return false;
        }
        this.remember(candidate.url, { displayUrl: result.displayUrl, sha256: result.sha256 });
        return true;
      })
      .catch((error: unknown) => {
        if (runId === this.currentRunId && this.isActive) {
          this.rememberFailure(candidate.url, imageLoadFailureMessage(error instanceof Error ? error.message : 'unknown error'));
          this.clearInflightIfCurrent(candidate.url, promise);
          this.topUp(attemptedFieldIds, candidate.direction, runId);
        }
        return false;
      })
      .finally(() => {
        this.clearInflightIfCurrent(candidate.url, promise);
      });
    this.inflight.set(candidate.url, promise);
    return await promise;
  }

  private clearInflightIfCurrent(url: string, promise: Promise<boolean>): void {
    if (this.inflight.get(url) === promise) this.inflight.delete(url);
  }

  private remember(url: string, loaded: { readonly displayUrl: string; readonly sha256: string | null }): void {
    if (this.cache.has(url)) this.cache.delete(url);
    this.cache.set(url, { status: 'loaded', ...loaded });
    this.pruneCache();
  }

  private rememberFailure(url: string, message: string): void {
    if (this.cache.has(url)) this.cache.delete(url);
    this.cache.set(url, { status: 'failed', message });
    this.pruneCache();
  }
}
