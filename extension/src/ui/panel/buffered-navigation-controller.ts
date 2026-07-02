import type { FetchDecodedBufferedImageResult, ProbeBufferedImageResult } from '../../content/buffered-image-source.js';
import type { checkImageRequestPolicy } from '../../content/image-request-policy.js';
import { imageResourceUrlsEqual } from '../../core/image/image-navigation.js';
import type { ImageProbeMethod, ImageRequestIntent } from '../../core/image/request-policy.js';
import {
  ImageStatus,
  ManifestStatus,
  bufferedPreloadWindowIndices,
  classifyBufferedImageIndex,
  createBufferedImageNavigationState,
  reduceBufferedImageNavigation,
  type BufferedImageIndexState,
  type BufferedImageNavigationState,
} from '../../core/url/buffered-image-navigation.js';
import type { NeighborPreloadDirection } from '../../core/url/preload-neighbors.js';
import { bumpUrlField, rebuildUrl } from '../../core/url/rebuild-url.js';
import { collectUrlFields } from '../../core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../../core/url/types.js';

const MAX_BUFFERED_HEAD_CONCURRENCY = 10;
const MAX_BUFFERED_GET_CONCURRENCY = 4;

interface BufferedNavigationRequest {
  readonly runId: number;
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  advanceOnResolve: boolean;
}

export interface BufferedNavigationLocalSettings {
  readonly neighborPreloadEnabled: boolean;
  readonly neighborPreloadRadius: number;
  readonly neighborPreloadProbeMethod: ImageProbeMethod;
}

export interface BufferedNavigationDebugSnapshot {
  readonly cursor: number;
  readonly bufferN: number;
  readonly indices: ReadonlyMap<number, BufferedImageIndexState>;
}

type CheckRequestPolicyResult = Awaited<ReturnType<typeof checkImageRequestPolicy>>;

export interface BufferedNavigationControllerDeps {
  getLocalSettings(): BufferedNavigationLocalSettings;
  currentNavigationBaseRawUrl(): string;
  currentNavigationBaseModel(): ParsedUrlModel;
  includedNavigationFields(fields: readonly UrlField[]): readonly UrlField[];
  currentKnownImageFingerprint(): string | null;
  hasSelectedTarget(): boolean;
  currentPageHref(): string;
  applyLandedUrl(nextUrl: string, displayUrl: string, sha256: string | null, attemptedFieldIds: readonly string[]): Promise<boolean>;
  createPlaceholderImage(): HTMLImageElement;
  scheduleRevoke(blobUrl: string): void;
  onToast(message: string): void;
  onSkipCapReached(message: string): void;
  onDebugChanged(): void;
  checkRequestPolicy(
    url: string,
    options: { readonly intent?: ImageRequestIntent; readonly contextKey?: string },
  ): Promise<CheckRequestPolicyResult>;
  probeImage(
    url: string,
    timeoutMs: number,
    options: { readonly contextKey?: string; readonly probeMethod?: ImageProbeMethod },
  ): Promise<ProbeBufferedImageResult>;
  fetchDecodedImage(
    url: string,
    options: { readonly intent?: ImageRequestIntent; readonly contextKey?: string },
  ): Promise<FetchDecodedBufferedImageResult>;
}

export class BufferedNavigationController {
  private navigation: BufferedImageNavigationState | null = null;
  private navigationKey: string | null = null;
  private runId = 0;
  private baseModel: ParsedUrlModel | null = null;
  private fields: readonly UrlField[] = [];
  private headInflight = new Map<number, BufferedNavigationRequest>();
  private getInflight = new Map<number, BufferedNavigationRequest>();
  private headQueue: number[] = [];
  private getQueue: number[] = [];
  private headQueued = new Map<number, BufferedNavigationRequest>();
  private getQueued = new Map<number, BufferedNavigationRequest>();
  private debugVisible = false;

  constructor(private readonly deps: BufferedNavigationControllerDeps) {}

  prime(): void {
    const settings = this.deps.getLocalSettings();
    if (!(settings.neighborPreloadEnabled && settings.neighborPreloadRadius > 0)) {
      this.runId += 1;
      this.navigation = null;
      this.navigationKey = null;
      this.baseModel = null;
      this.fields = [];
      this.clearQueues();
      this.cancelInflight();
      return;
    }
    if (!this.deps.hasSelectedTarget()) return;
    let model: ParsedUrlModel;
    try {
      model = this.deps.currentNavigationBaseModel();
    } catch {
      return;
    }
    const fields = this.deps.includedNavigationFields(collectUrlFields(model));
    if (fields.length === 0) return;
    this.ensure(model, fields);
  }

  async step(model: ParsedUrlModel, fields: readonly UrlField[], direction: NeighborPreloadDirection): Promise<'loaded' | 'blocked'> {
    this.ensure(model, fields);
    if (!this.navigation || !this.baseModel) return 'blocked';
    const runId = this.runId;
    const previousCursor = this.navigation.cursor;
    this.navigation = reduceBufferedImageNavigation(this.navigation, { type: 'SEEK', dir: direction });
    for (let attempt = 0; attempt <= this.navigation.settings.probeK + 1; attempt += 1) {
      if (this.navigation.cursor !== previousCursor) {
        const landed = this.navigation.indices.get(this.navigation.cursor);
        if (landed?.image === ImageStatus.OK && landed.url && landed.blobUrl) {
          const loaded = await this.deps.applyLandedUrl(
            landed.url,
            landed.blobUrl,
            landed.sha256,
            fields.map((field) => field.id),
          );
          this.schedulePreloads();
          return loaded ? 'loaded' : 'blocked';
        }
      }
      const blockedOn = this.navigation.blockedOn;
      if (blockedOn === null) {
        this.schedulePreloads();
        return 'blocked';
      }
      await this.resolveIndex(blockedOn, { advanceOnResolve: true });
      if (!this.isCurrentRun(runId)) return 'blocked';
      // Re-run the seek against the now-updated index states. resolveIndex() only fires an ADVANCE
      // via advanceOnResolve when it actually performs a probe/GET; when the blocked index was
      // already resolved (e.g. the preload finished it before the seek reached it) it is a no-op,
      // so without this the cursor would never move onto that landable neighbor and the loop would
      // spin to the skip cap instead of skipping past failed images to the next good one.
      this.navigation = reduceBufferedImageNavigation(this.navigation, { type: 'ADVANCE' });
    }
    console.warn('Image Trail buffered navigation reached the skip cap before finding a decoded image.', {
      direction,
      cursor: this.navigation.cursor,
    });
    this.deps.onSkipCapReached('Parsed-field navigation is waiting for a decoded neighbor image.');
    return 'blocked';
  }

  toggleDebugVisible(): void {
    this.debugVisible = !this.debugVisible;
    this.deps.onDebugChanged();
  }

  getDebugSnapshot(): BufferedNavigationDebugSnapshot | null {
    if (!this.debugVisible || !this.navigation) return null;
    return { cursor: this.navigation.cursor, bufferN: this.navigation.settings.bufferN, indices: this.navigation.indices };
  }

  refreshPreloads(): void {
    this.schedulePreloads();
  }

  dispose(): void {
    this.runId += 1;
    this.clearQueues();
    this.cancelInflight();
    this.navigation = null;
    this.navigationKey = null;
    this.baseModel = null;
    this.fields = [];
  }

  private ensure(model: ParsedUrlModel, fields: readonly UrlField[]): void {
    if (this.reuseForCurrentUrl(fields)) return;
    const baseUrl = rebuildUrl(model);
    const key = `${baseUrl}|${fields.map((field) => field.id).join(',')}|${this.deps.getLocalSettings().neighborPreloadRadius}`;
    if (this.navigationKey === key && this.navigation) return;
    const bufferN = this.radius();
    let navigation = createBufferedImageNavigationState(bufferN);
    navigation = reduceBufferedImageNavigation(navigation, {
      type: 'SET_MANIFEST',
      index: 0,
      status: ManifestStatus.PRESENT,
      url: baseUrl,
    });
    navigation = reduceBufferedImageNavigation(navigation, {
      type: 'SET_IMAGE',
      index: 0,
      status: ImageStatus.OK,
      blobUrl: baseUrl,
      imgElement: this.deps.createPlaceholderImage(),
      sha256: this.deps.currentKnownImageFingerprint(),
    });
    navigation = reduceBufferedImageNavigation(navigation, { type: 'INIT_CURSOR', index: 0 });
    this.runId += 1;
    this.navigation = navigation;
    this.navigationKey = key;
    this.baseModel = model;
    this.fields = fields;
    this.clearQueues();
    this.cancelInflight();
    this.schedulePreloads();
  }

  private reuseForCurrentUrl(fields: readonly UrlField[]): boolean {
    if (!this.navigation || this.fields.length === 0) return false;
    const bufferN = this.radius();
    if (this.navigation.settings.bufferN !== bufferN) return false;
    const currentFieldIds = fields.map((field) => field.id).join(',');
    const bufferedFieldIds = this.fields.map((field) => field.id).join(',');
    if (currentFieldIds !== bufferedFieldIds) return false;
    const currentUrl = this.deps.currentNavigationBaseRawUrl();
    const pageHref = this.deps.currentPageHref();
    let matchedIndex: number | null = null;
    for (const [index, entry] of this.navigation.indices) {
      if (!entry.url) continue;
      if (imageResourceUrlsEqual(entry.url, currentUrl, pageHref)) {
        matchedIndex = index;
        break;
      }
    }
    if (matchedIndex === null) return false;
    if (this.navigation.cursor !== matchedIndex) {
      this.navigation = reduceBufferedImageNavigation(this.navigation, { type: 'INIT_CURSOR', index: matchedIndex });
      this.clearQueues();
    }
    this.schedulePreloads();
    return true;
  }

  private urlForIndex(index: number): string | null {
    if (!this.baseModel || this.fields.length === 0) return null;
    if (index === 0) return rebuildUrl(this.baseModel);
    const direction: NeighborPreloadDirection = index > 0 ? 1 : -1;
    let model = this.baseModel;
    for (let step = 0; step < Math.abs(index); step += 1) {
      model = this.fields.reduce<ParsedUrlModel>((nextModel, field) => bumpUrlField(nextModel, field, direction), model);
    }
    return rebuildUrl(model);
  }

  private radius(): number {
    return Math.max(0, Math.min(5, this.deps.getLocalSettings().neighborPreloadRadius));
  }

  private async resolveIndex(index: number, options: { readonly advanceOnResolve?: boolean } = {}): Promise<void> {
    if (!this.navigation) return;
    const current = this.navigation.indices.get(index);
    if (classifyBufferedImageIndex(current) !== 'WALL') return;
    await this.probeIndex(index, options);
    // dispose()/prime()/ensure() can settle this probe out from under us (see cancelInflight()),
    // so navigation may already be gone by the time we resume.
    if (!this.navigation) return;
    const probed = this.navigation.indices.get(index);
    if (probed?.manifest === ManifestStatus.PRESENT && probed.image !== ImageStatus.OK && probed.image !== ImageStatus.FAILED_GET) {
      await this.getIndex(index, options);
    }
  }

  private async probeIndex(index: number, options: { readonly advanceOnResolve?: boolean } = {}): Promise<void> {
    if (!this.navigation) return;
    const current = this.navigation.indices.get(index);
    if (
      current?.manifest === ManifestStatus.PRESENT ||
      current?.manifest === ManifestStatus.FAILED_HEAD ||
      current?.manifest === ManifestStatus.END
    ) {
      return;
    }
    const inflight = this.headInflight.get(index);
    if (inflight) {
      if (options.advanceOnResolve) inflight.advanceOnResolve = true;
      return inflight.promise;
    }
    const queued = this.headQueued.get(index);
    if (queued) {
      if (options.advanceOnResolve) queued.advanceOnResolve = true;
      return queued.promise;
    }
    const url = this.urlForIndex(index);
    if (!url) return;
    const runId = this.runId;
    let resolveQueued!: () => void;
    let rejectQueued!: (error: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolveQueued = resolve;
      rejectQueued = reject;
    });
    this.headQueued.set(index, {
      runId,
      promise,
      resolve: resolveQueued,
      reject: rejectQueued,
      advanceOnResolve: options.advanceOnResolve === true,
    });
    this.headQueue.push(index);
    this.sortQueues();
    this.drainHeadQueue();
    return promise;
  }

  private startHeadProbe(index: number): void {
    const queued = this.headQueued.get(index);
    if (!queued) return;
    this.headQueued.delete(index);
    if (!this.isCurrentRun(queued.runId)) {
      queued.resolve();
      return;
    }
    const promise = (async (): Promise<void> => {
      const url = this.urlForIndex(index);
      if (!url) return;
      if (!this.isCurrentRun(queued.runId)) return;
      const contextKey = this.requestContextKey(index, queued.runId);
      const policy = await this.deps.checkRequestPolicy(url, { intent: 'field-speculative-probe', contextKey });
      if (!this.isCurrentRun(queued.runId)) return;
      if (policy.status === 'skippable-failed') {
        this.navigation = reduceBufferedImageNavigation(this.navigation!, {
          type: 'SET_MANIFEST',
          index,
          status: ManifestStatus.FAILED_HEAD,
          url,
        });
        if (queued.advanceOnResolve) this.navigation = reduceBufferedImageNavigation(this.navigation, { type: 'ADVANCE' });
        this.deps.onDebugChanged();
        return;
      }
      if (policy.status === 'cached-success') {
        this.navigation = reduceBufferedImageNavigation(this.navigation!, {
          type: 'SET_MANIFEST',
          index,
          status: ManifestStatus.PRESENT,
          url,
        });
        if (queued.advanceOnResolve) this.navigation = reduceBufferedImageNavigation(this.navigation, { type: 'ADVANCE' });
        this.deps.onDebugChanged();
        return;
      }
      this.navigation = reduceBufferedImageNavigation(this.navigation!, {
        type: 'SET_MANIFEST',
        index,
        status: ManifestStatus.HEAD_PENDING,
        url,
      });
      const probeMethod = this.deps.getLocalSettings().neighborPreloadProbeMethod;
      const result = await this.deps.probeImage(url, 8000, { contextKey, probeMethod });
      if (!this.isCurrentRun(queued.runId)) return;
      const skippableProbeFailure = !result.ok && (probeMethod === 'get' || this.isSkippableHeadFailure(result.status));
      if (skippableProbeFailure) this.deps.onToast('Skipped a failed image candidate.');
      this.navigation = reduceBufferedImageNavigation(this.navigation!, {
        type: 'SET_MANIFEST',
        index,
        status: result.ok || !skippableProbeFailure ? ManifestStatus.PRESENT : ManifestStatus.FAILED_HEAD,
        url,
      });
      if (queued.advanceOnResolve) this.navigation = reduceBufferedImageNavigation(this.navigation, { type: 'ADVANCE' });
      this.deps.onDebugChanged();
    })();
    this.headInflight.set(index, queued);
    void promise.then(queued.resolve, queued.reject).finally(() => {
      this.headInflight.delete(index);
      this.drainHeadQueue();
    });
  }

  private async getIndex(index: number, options: { readonly advanceOnResolve?: boolean } = {}): Promise<void> {
    if (!this.navigation) return;
    const current = this.navigation.indices.get(index);
    if (current?.image === ImageStatus.OK || current?.image === ImageStatus.FAILED_GET) return;
    const inflight = this.getInflight.get(index);
    if (inflight) {
      if (options.advanceOnResolve) inflight.advanceOnResolve = true;
      return inflight.promise;
    }
    const queued = this.getQueued.get(index);
    if (queued) {
      if (options.advanceOnResolve) queued.advanceOnResolve = true;
      return queued.promise;
    }
    const url = current?.url ?? this.urlForIndex(index);
    if (!url) return;
    const runId = this.runId;
    let resolveQueued!: () => void;
    let rejectQueued!: (error: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolveQueued = resolve;
      rejectQueued = reject;
    });
    this.getQueued.set(index, {
      runId,
      promise,
      resolve: resolveQueued,
      reject: rejectQueued,
      advanceOnResolve: options.advanceOnResolve === true,
    });
    this.getQueue.push(index);
    this.sortQueues();
    this.drainGetQueue();
    return promise;
  }

  private startGet(index: number): void {
    const queued = this.getQueued.get(index);
    if (!queued) return;
    this.getQueued.delete(index);
    if (!this.isCurrentRun(queued.runId)) {
      queued.resolve();
      return;
    }
    const promise = (async (): Promise<void> => {
      const current = this.navigation!.indices.get(index);
      const url = current?.url ?? this.urlForIndex(index);
      if (!url) return;
      if (!this.isCurrentRun(queued.runId)) return;
      this.navigation = reduceBufferedImageNavigation(this.navigation!, { type: 'SET_IMAGE', index, status: ImageStatus.GET_PENDING });
      const result = await this.deps.fetchDecodedImage(url, {
        intent: 'field-active-navigation',
        contextKey: this.requestContextKey(index, queued.runId),
      });
      if (!this.isCurrentRun(queued.runId)) return;
      if (result.ok) {
        this.navigation = reduceBufferedImageNavigation(this.navigation!, {
          type: 'SET_IMAGE',
          index,
          status: ImageStatus.OK,
          blobUrl: result.blobUrl,
          imgElement: result.imgElement,
          sha256: result.sha256,
        });
      } else {
        this.navigation = reduceBufferedImageNavigation(this.navigation!, { type: 'SET_IMAGE', index, status: ImageStatus.FAILED_GET });
        console.debug('Image Trail buffered navigation skipped unavailable candidate image.', { index, url, message: result.message });
        this.deps.onToast('Skipped a failed image candidate.');
      }
      if (queued.advanceOnResolve) this.navigation = reduceBufferedImageNavigation(this.navigation, { type: 'ADVANCE' });
      this.deps.onDebugChanged();
    })();
    this.getInflight.set(index, queued);
    void promise.then(queued.resolve, queued.reject).finally(() => {
      this.getInflight.delete(index);
      this.drainGetQueue();
    });
  }

  private drainHeadQueue(): void {
    while (this.headInflight.size < MAX_BUFFERED_HEAD_CONCURRENCY && this.headQueue.length > 0) {
      const index = this.headQueue.shift()!;
      if (!this.headQueued.has(index)) continue;
      this.startHeadProbe(index);
    }
  }

  private drainGetQueue(): void {
    while (this.getInflight.size < MAX_BUFFERED_GET_CONCURRENCY && this.getQueue.length > 0) {
      const index = this.getQueue.shift()!;
      if (!this.getQueued.has(index)) continue;
      this.startGet(index);
    }
  }

  private sortQueues(): void {
    const cursor = this.navigation?.cursor ?? 0;
    const byDistance = (a: number, b: number): number => Math.abs(a - cursor) - Math.abs(b - cursor) || a - b;
    this.headQueue.sort(byDistance);
    this.getQueue.sort(byDistance);
  }

  private clearQueues(): void {
    for (const queued of this.headQueued.values()) queued.resolve();
    for (const queued of this.getQueued.values()) queued.resolve();
    this.headQueue = [];
    this.getQueue = [];
    this.headQueued.clear();
    this.getQueued.clear();
  }

  // Settles requests already promoted to in-flight (unlike clearQueues(), which only settles
  // requests still waiting their turn) so callers awaiting probeIndex()/getIndex() unblock
  // immediately instead of waiting on the underlying network call to finish on its own.
  private cancelInflight(): void {
    for (const request of this.headInflight.values()) request.resolve();
    for (const request of this.getInflight.values()) request.resolve();
    this.headInflight.clear();
    this.getInflight.clear();
  }

  private isCurrentRun(runId: number): boolean {
    return this.navigation !== null && this.runId === runId;
  }

  private requestContextKey(index: number, runId: number): string {
    return ['buffered-field-navigation', String(runId), this.navigationKey ?? '', String(index)].join('\n');
  }

  private isSkippableHeadFailure(status: number | undefined): boolean {
    return status === 400 || status === 404 || status === 410;
  }

  private schedulePreloads(): void {
    if (!this.navigation) return;
    const { cursor, settings } = this.navigation;
    const preloadIndices = bufferedPreloadWindowIndices(cursor, settings.bufferN);
    const liveIndices = new Set([cursor, ...preloadIndices]);
    for (const [index, entry] of this.navigation.indices) {
      if (liveIndices.has(index)) continue;
      if (entry.blobUrl && entry.blobUrl.startsWith('blob:')) {
        this.deps.scheduleRevoke(entry.blobUrl);
      }
      this.navigation = reduceBufferedImageNavigation(this.navigation, { type: 'EVICT', index });
    }
    for (const index of preloadIndices) {
      void this.resolveIndex(index, { advanceOnResolve: false });
    }
  }
}
