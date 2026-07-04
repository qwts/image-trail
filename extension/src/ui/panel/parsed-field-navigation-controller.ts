import type { PageAdapter } from '../../content/page-adapter.js';
import { checkImageRequestPolicy } from '../../content/image-request-policy.js';
import type { RequestGovernor } from '../../content/request-governor.js';
import { setAutomationState, setTargetState } from '../../core/state.js';
import type { PanelState, UrlReviewStatus } from '../../core/types.js';
import {
  adjacentParsedFieldUrlCandidates,
  type AdjacentParsedFieldUrlCandidate,
  type NeighborPreloadDirection,
} from '../../core/url/preload-neighbors.js';
import { collectUrlFields } from '../../core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../../core/url/types.js';
import type { BufferedNavigationController } from './buffered-navigation-controller.js';
import { delay } from './export-download.js';
import { NEIGHBOR_PRELOAD_FILL_SCAN_LIMIT, type NeighborPreloadController } from './neighbor-preload-controller.js';
import { toTargetState, urlReviewStatusForLoadResult, type ProjectionApplicationController } from './projection-application-controller.js';

const PARSED_NAVIGATION_RETRY_MIN_DELAY_MS = 25;

// Primary stop for the "skip to next good image" auto-advance: a dead run ends after this many
// CONSECUTIVE misses (or the user's neighbor-preload radius, whichever is larger — a user who asked
// for a deeper buffer has opted into probing that far). Each miss is a real remote request, so a
// keypress into a gap must give up after a few probes, not walk the whole scan window (#287).
const MIN_CONSECUTIVE_MISS_SHORT_CIRCUIT = 3;

// Outer safety net: the TOTAL number of skips a single navigation drain may accumulate, counted
// across successes (unlike the consecutive budget, which resets on each loaded image). Bounds a
// long queued burst over a sparse gallery so one drain can never hammer the network indefinitely,
// regardless of how the navigation base moves between steps.
const MAX_PARSED_NAVIGATION_SKIP_ATTEMPTS = 50;

type QueuedParsedNavigationStepResult = 'blocked' | 'loaded' | 'retry' | 'wait';
type ParsedNavigationSource = 'manual' | 'slideshow' | 'retry';

export interface ParsedFieldNavigationControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  loadGrabSettings(): Promise<void>;
  saveFieldState(): Promise<void>;
  saveUrlTemplateFromCurrentFields(): Promise<void>;
  currentNavigationBaseModel(): ParsedUrlModel;
  currentNavigationBaseRawUrl(): string;
  // Shared field-state helpers stay panel-owned — the projection controller and field editor use them too.
  currentKnownImageFingerprint(): string | null;
  applyFieldLoadResult(
    state: PanelState,
    attemptedFieldIds: readonly string[],
    nextFingerprint: string | null,
    previousFingerprint: string | null,
  ): PanelState;
  saveUrlReviewStatus(status: UrlReviewStatus, sourceUrl: string, fieldIds: readonly string[], reason?: string): Promise<void>;
  isNavigableQueryField(field: UrlField): boolean;
  // The user's neighbor-preload radius; raises the consecutive-miss short-circuit above its floor.
  neighborPreloadRadius(): number;
  // Collaborators are Pick-typed so test fakes compile despite the classes' private members.
  governor(): Pick<RequestGovernor, 'request' | 'nextReadyDelayMs' | 'requestsInWindow'>;
  bufferedNav(): Pick<BufferedNavigationController, 'step'>;
  neighborPreload(): Pick<NeighborPreloadController, 'isActive' | 'runId'>;
  projectionApplication(): Pick<
    ProjectionApplicationController,
    'applySelectedUrl' | 'beginProjectionSession' | 'applyProjectionToSelectedImage' | 'isCurrentProjectionSession'
  >;
  pageAdapter(): Pick<PageAdapter, 'getSnapshot'>;
}

/**
 * The parsed-field navigation queue, moved verbatim off `ImageTrailPanel`: the serialized
 * arrow/next/prev drain that walks parsed-field neighbors, skips failed URLs under a bounded budget,
 * and drives the buffered-nav fast path. It consumes the public projection-session methods on
 * `ProjectionApplicationController` (its collaborator, extracted in #316) and the shared field-state
 * helpers, both of which stay panel-owned and are injected. Order-sensitive: the single-flight
 * `parsedNavigationQueueRunning` guard with its `finally` re-arm, the per-drain skip budget, the
 * governor-delayed step-result dispatch, and the buffered fast-path → candidate-scan fall-through.
 */
export class ParsedFieldNavigationController {
  // Per-source queued deltas keep the drain able to cancel one source (e.g. an opposite manual step
  // clears queued slideshow navigation) without dropping the others; the drain reads their sum.
  private readonly queuedParsedNavigationDeltas: Record<ParsedNavigationSource, number> = {
    manual: 0,
    retry: 0,
    slideshow: 0,
  };
  private parsedNavigationQueueRunning = false;
  // URLs skipped (failed to load) since the last successful load of the CURRENT navigation drain
  // session — i.e. its size is the consecutive-miss count. Scoped to the drain, not to the
  // navigation base — the base can advance to a just-failed URL between steps (e.g. the manual
  // "next" button with no stable selected target sets draftUrl to the failed URL), so a base-keyed
  // guard would reset every step and never bound the walk. The consecutive-miss short-circuit ends
  // a dead run after a few probes, while still letting navigation skip forward to the next good image.
  private readonly navigationSessionSkippedUrls = new Set<string>();
  // Total skips across the whole drain (never reset on success) — feeds the outer safety net.
  private navigationSessionTotalSkips = 0;

  constructor(private readonly deps: ParsedFieldNavigationControllerDeps) {}

  navigateBy(delta: 1 | -1, source: ParsedNavigationSource = 'manual'): void {
    this.queuedParsedNavigationDeltas[source] += delta;
    this.normalizeQueuedParsedNavigationDeltas();
    void this.drainQueuedParsedNavigation();
  }

  cancelQueuedSlideshowNavigation(): void {
    this.queuedParsedNavigationDeltas.slideshow = 0;
  }

  private async drainQueuedParsedNavigation(): Promise<void> {
    if (this.parsedNavigationQueueRunning) return;
    this.parsedNavigationQueueRunning = true;
    this.navigationSessionSkippedUrls.clear();
    this.navigationSessionTotalSkips = 0;
    try {
      while (this.queuedParsedNavigationDelta() !== 0) {
        const delta = this.queuedParsedNavigationDelta() > 0 ? 1 : -1;
        const source = this.nextQueuedParsedNavigationSource(delta);
        if (!source) break;
        const result = await this.runQueuedParsedNavigationStep(delta);
        if (result === 'blocked') {
          this.clearQueuedParsedNavigation();
          break;
        }
        if (result === 'wait') {
          const delayMs = Math.max(PARSED_NAVIGATION_RETRY_MIN_DELAY_MS, this.deps.governor().nextReadyDelayMs());
          await delay(delayMs);
          continue;
        }
        if (result === 'retry') {
          await delay(PARSED_NAVIGATION_RETRY_MIN_DELAY_MS);
          continue;
        }
        if (result === 'loaded' && Math.sign(this.queuedParsedNavigationDeltas[source]) === delta) {
          this.queuedParsedNavigationDeltas[source] -= delta;
          this.normalizeQueuedParsedNavigationDeltas();
        }
      }
    } finally {
      this.parsedNavigationQueueRunning = false;
      if (this.queuedParsedNavigationDelta() !== 0) void this.drainQueuedParsedNavigation();
    }
  }

  private queuedParsedNavigationDelta(): number {
    return this.queuedParsedNavigationDeltas.manual + this.queuedParsedNavigationDeltas.retry + this.queuedParsedNavigationDeltas.slideshow;
  }

  private clearQueuedParsedNavigation(): void {
    this.queuedParsedNavigationDeltas.manual = 0;
    this.queuedParsedNavigationDeltas.retry = 0;
    this.queuedParsedNavigationDeltas.slideshow = 0;
  }

  private normalizeQueuedParsedNavigationDeltas(): void {
    if (this.queuedParsedNavigationDelta() === 0) this.clearQueuedParsedNavigation();
  }

  private nextQueuedParsedNavigationSource(delta: 1 | -1): ParsedNavigationSource | null {
    const sources: readonly ParsedNavigationSource[] = ['manual', 'retry', 'slideshow'];
    return sources.find((source) => Math.sign(this.queuedParsedNavigationDeltas[source]) === delta) ?? null;
  }

  private async runQueuedParsedNavigationStep(delta: 1 | -1): Promise<QueuedParsedNavigationStepResult> {
    const snapshot = this.deps.pageAdapter().getSnapshot();
    if (!snapshot.selected?.url) return 'blocked';
    const model = this.deps.currentNavigationBaseModel();
    const fields = collectUrlFields(model);
    const navigableFields = this.includedNavigationFields(fields);
    if (navigableFields.length === 0) return 'blocked';
    const governor = this.deps.governor();
    if (this.deps.neighborPreload().isActive) {
      const buffered = await this.deps.bufferedNav().step(model, navigableFields, delta);
      if (buffered === 'loaded') {
        void this.deps.saveUrlTemplateFromCurrentFields();
        this.deps.setState(
          setAutomationState(this.deps.getState(), {
            governorStatus: 'ready',
            requestsInWindow: governor.requestsInWindow(),
          }),
        );
        this.deps.render();
        return 'loaded';
      }
      // buffered === 'blocked': the preloaded window held no landable image (failed/unknown
      // neighbors). Fall through to the candidate scan below instead of stopping — it skips URLs
      // already known to have failed (the buffered preload records them in the shared request-policy
      // cache, so no re-probe) and advances to the next good image, giving preload-on navigation the
      // same smooth skip-to-next-good behavior as the plain path.
    }
    const candidate = await this.nextParsedFieldNavigationCandidate(model, navigableFields, delta);
    if (!candidate) {
      const skipped = this.navigationSessionTotalSkips;
      this.deps.setState({
        ...this.deps.getState(),
        status: 'ready',
        message:
          skipped > 0
            ? `Stopped after skipping ${skipped} unavailable image${skipped === 1 ? '' : 's'}; no loadable image found in that direction.`
            : 'No non-failed parsed-field neighbor candidate found in that direction.',
        lastUpdatedAt: Date.now(),
      });
      this.deps.render();
      return 'blocked';
    }
    const nextUrl = candidate.url;
    const shouldStartNetworkRequest = !nextUrl.startsWith('data:image/');
    if (shouldStartNetworkRequest) {
      const request = governor.request(() => undefined);
      if (request.status !== 'ok') {
        this.deps.setState(
          setAutomationState(this.deps.getState(), {
            governorStatus: request.status,
            requestsInWindow: governor.requestsInWindow(),
          }),
        );
        this.deps.render();
        return 'wait';
      }
    }

    const loaded = await this.deps.projectionApplication().applySelectedUrl(
      nextUrl,
      navigableFields.map((field) => field.id),
      { preloadDirection: delta, quietFailure: true },
    );
    if (loaded) {
      void this.deps.saveUrlTemplateFromCurrentFields();
      // Progress made — the next segment of this drain gets a fresh consecutive-miss budget
      // (the total-skip safety net keeps counting).
      this.navigationSessionSkippedUrls.clear();
    } else {
      this.navigationSessionSkippedUrls.add(nextUrl);
      this.navigationSessionTotalSkips += 1;
    }

    this.deps.setState(
      setAutomationState(this.deps.getState(), {
        governorStatus: 'ready',
        requestsInWindow: governor.requestsInWindow(),
      }),
    );
    this.deps.render();
    return loaded ? 'loaded' : 'retry';
  }

  private consecutiveMissShortCircuit(): number {
    return Math.max(MIN_CONSECUTIVE_MISS_SHORT_CIRCUIT, this.deps.neighborPreloadRadius());
  }

  private async nextParsedFieldNavigationCandidate(
    model: ParsedUrlModel,
    fields: readonly UrlField[],
    direction: NeighborPreloadDirection,
  ): Promise<AdjacentParsedFieldUrlCandidate | null> {
    // Primary stop: a dead run ends after a few consecutive misses instead of probing the whole
    // scan window — each miss is a real remote request (#287). The outer total cap bounds the
    // drain as a whole, so a run of bad URLs stops instead of chasing the frontier forever (the
    // base can advance to each failed URL).
    if (this.navigationSessionSkippedUrls.size >= this.consecutiveMissShortCircuit()) return null;
    if (this.navigationSessionTotalSkips >= MAX_PARSED_NAVIGATION_SKIP_ATTEMPTS) return null;
    const candidates = adjacentParsedFieldUrlCandidates(model, fields, NEIGHBOR_PRELOAD_FILL_SCAN_LIMIT)
      .filter((candidate) => candidate.direction === direction)
      .sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates) {
      if (this.navigationSessionSkippedUrls.has(candidate.url)) continue;
      const policy = await checkImageRequestPolicy(candidate.url, {
        intent: 'field-active-navigation',
        contextKey: this.parsedFieldRequestContextKey(
          fields.map((field) => field.id),
          direction,
          this.deps.neighborPreload().runId,
        ),
      });
      if (policy.status === 'skippable-failed') continue;
      return candidate;
    }
    return null;
  }

  async applyBufferedNavigationUrl(
    nextUrl: string,
    displayUrl: string,
    sha256: string | null,
    attemptedFieldIds: readonly string[],
  ): Promise<boolean> {
    const projectionApplication = this.deps.projectionApplication();
    const session = projectionApplication.beginProjectionSession('parsed-field-navigation', nextUrl);
    if (!session) return false;
    const baselineFingerprint = this.deps.currentKnownImageFingerprint();
    const reviewStatus = urlReviewStatusForLoadResult(sha256, baselineFingerprint);
    const snapshot = this.deps.pageAdapter().getSnapshot();
    if (snapshot.selected) {
      const nextSnapshot = projectionApplication.applyProjectionToSelectedImage(session, displayUrl);
      if (!nextSnapshot) return false;
      if (!projectionApplication.isCurrentProjectionSession(session)) return false;
      this.deps.setState({ ...setTargetState(this.deps.getState(), toTargetState(nextSnapshot)), draftUrl: null });
    }
    this.deps.setState(this.deps.applyFieldLoadResult(this.deps.getState(), attemptedFieldIds, sha256, baselineFingerprint));
    if (reviewStatus === 'passed') void this.deps.saveUrlReviewStatus(reviewStatus, nextUrl, attemptedFieldIds);
    void this.deps.saveFieldState();
    this.deps.render();
    void this.deps.loadGrabSettings();
    return true;
  }

  // Every included ("locked") navigable field participates in prev/next/arrow navigation: one press
  // steps them ALL together into a single combined URL, the same result as clicking each field's
  // +/- once (#263). Non-navigable included fields (e.g. text tokens) simply don't participate.
  // Candidate generation and preload receive the same set, so the buffered window warms the
  // combined trail rather than a single field's neighbors.
  includedNavigationFields(fields: readonly UrlField[]): readonly UrlField[] {
    return fields.filter((field) => this.isUnlockedNavigableField(field));
  }

  parsedFieldRequestContextKey(
    attemptedFieldIds: readonly string[],
    direction: NeighborPreloadDirection | undefined,
    runId: number,
  ): string {
    const state = this.deps.getState();
    return [
      'parsed-field-navigation',
      String(runId),
      this.deps.currentNavigationBaseRawUrl(),
      attemptedFieldIds.join(','),
      state.fieldSplitSpecs.map((spec) => `${spec.baseFieldId}:${spec.pattern}`).join('|'),
      state.fieldDigitWidthSpecs.map((spec) => `${spec.fieldId}:${spec.width}:${spec.sourceWidth ?? ''}`).join('|'),
      state.target.selectedHandleId ?? '',
      direction === undefined ? '' : String(direction),
    ].join('\n');
  }

  private isUnlockedNavigableField(field: UrlField): boolean {
    return this.deps.getState().unlockedFieldIds.includes(field.id) && this.deps.isNavigableQueryField(field);
  }
}
