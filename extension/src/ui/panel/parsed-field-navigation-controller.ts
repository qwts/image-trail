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

// How long a governor-throttled drain keeps a MANUAL intent alive. Manual navigation is a live
// gesture: if the request window forces a wait longer than this, the user has visibly stopped
// getting responses and a load landing much later reads as random (#373). Automation sources
// (slideshow/retry) are exempt — they are scheduled work and must ride out the window.
const MANUAL_NAVIGATION_MAX_WAIT_MS = 3_000;

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

  // Escape/Stop must not leave queued manual steps applying after the user asked everything to
  // stop (#373). The in-flight step (at most one — the drain is single-flight) still completes.
  cancelQueuedManualNavigation(): void {
    this.queuedParsedNavigationDeltas.manual = 0;
  }

  private async drainQueuedParsedNavigation(): Promise<void> {
    if (this.parsedNavigationQueueRunning) return;
    this.parsedNavigationQueueRunning = true;
    this.navigationSessionSkippedUrls.clear();
    this.navigationSessionTotalSkips = 0;
    this.setNavigationBusy(true);
    try {
      while (this.queuedParsedNavigationDelta() !== 0) {
        const delta = this.queuedParsedNavigationDelta() > 0 ? 1 : -1;
        const source = this.nextQueuedParsedNavigationSource(delta);
        if (!source) break;
        // Latest wins (#373): a burst of manual input coalesces into ONE jump for the whole queued
        // delta instead of one image load per press — when input stops, at most the in-flight step
        // plus one coalesced step ever apply. The claim is captured before the await so presses
        // arriving mid-load stay queued for the next iteration. Slideshow/retry stay single-step:
        // their cadence is scheduled, not a burst to collapse.
        const claimed = source === 'manual' ? this.queuedParsedNavigationDeltas.manual : delta;
        const result = await this.runQueuedParsedNavigationStep(delta, Math.abs(claimed));
        if (result === 'blocked') {
          this.clearQueuedParsedNavigation();
          break;
        }
        if (result === 'wait') {
          const delayMs = Math.max(PARSED_NAVIGATION_RETRY_MIN_DELAY_MS, this.deps.governor().nextReadyDelayMs());
          if (this.shouldAbandonManualWait(delayMs)) break;
          await delay(delayMs);
          continue;
        }
        if (result === 'retry') {
          await delay(PARSED_NAVIGATION_RETRY_MIN_DELAY_MS);
          continue;
        }
        if (result === 'loaded' && Math.sign(this.queuedParsedNavigationDeltas[source]) === delta) {
          // Consume the whole claim, clamped so presses that netted the queue down mid-load can't
          // flip its sign.
          const consumed =
            source === 'manual' ? delta * Math.min(Math.abs(claimed), Math.abs(this.queuedParsedNavigationDeltas.manual)) : delta;
          this.queuedParsedNavigationDeltas[source] -= consumed;
          this.normalizeQueuedParsedNavigationDeltas();
        }
      }
    } finally {
      this.parsedNavigationQueueRunning = false;
      this.setNavigationBusy(false);
      if (this.queuedParsedNavigationDelta() !== 0) {
        void this.drainQueuedParsedNavigation();
      } else {
        this.reconcileRestingFailureMarker();
      }
    }
  }

  // A quiet skip (`applySelectedUrl({ quietFailure: true })`) sets `failedFieldId` during traversal
  // so mid-drain steps re-base off the last-good `selectedUrl` rather than the failed candidate's
  // draft. A successful land clears it, but a drain that stops WITHOUT landing (no candidate /
  // blocked / abandoned wait) would otherwise strand it: the field rests on its last successfully
  // displayed value yet stays outlined red, and the failed draft would seed the next press's
  // navigation base (#447). Once the queue is fully drained, reconcile that transient marker. The
  // candidate skip is driven by the request-policy cache + session skip set, not `failedFieldId`,
  // so clearing it here does not change skip behavior.
  private reconcileRestingFailureMarker(): void {
    const state = this.deps.getState();
    if (state.failedFieldId === null) return;
    this.deps.setState({ ...state, failedFieldId: null, draftUrl: null, lastUpdatedAt: Date.now() });
    this.deps.render();
  }

  private setNavigationBusy(busy: boolean): void {
    if (this.deps.getState().automation.navigationBusy === busy) return;
    this.deps.setState(setAutomationState(this.deps.getState(), { navigationBusy: busy }));
    this.deps.render();
  }

  // A throttled MANUAL drain gives up instead of applying a load long after the user stopped
  // pressing; queued automation keeps the normal wait path so slideshow/retry ride out the window.
  private shouldAbandonManualWait(delayMs: number): boolean {
    if (delayMs <= MANUAL_NAVIGATION_MAX_WAIT_MS) return false;
    if (this.queuedParsedNavigationDeltas.retry !== 0 || this.queuedParsedNavigationDeltas.slideshow !== 0) return false;
    if (this.queuedParsedNavigationDeltas.manual === 0) return false;
    this.cancelQueuedManualNavigation();
    this.deps.setState({
      ...this.deps.getState(),
      status: 'ready',
      message: `Request limit reached; navigation stopped instead of loading ${Math.ceil(delayMs / 1000)}s from now. Try again shortly.`,
      lastUpdatedAt: Date.now(),
    });
    this.deps.render();
    return true;
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

  private async runQueuedParsedNavigationStep(delta: 1 | -1, jumpDistance: number): Promise<QueuedParsedNavigationStepResult> {
    const snapshot = this.deps.pageAdapter().getSnapshot();
    if (!snapshot.selected?.url) return 'blocked';
    const model = this.deps.currentNavigationBaseModel();
    const fields = collectUrlFields(model);
    const navigableFields = this.includedNavigationFields(fields);
    if (navigableFields.length === 0) return 'blocked';
    const governor = this.deps.governor();
    // The buffered fast path only steps one neighbor at a time; coalesced multi-step jumps go
    // straight to the candidate scan, which can land the net distance in a single load.
    if (jumpDistance === 1 && this.deps.neighborPreload().isActive) {
      const buffered = await this.deps.bufferedNav().step(model, navigableFields, delta);
      if (buffered === 'loaded') {
        void this.deps.saveUrlTemplateFromCurrentFields();
        // A buffered landing is progress too — reset the consecutive-miss budget so stale
        // candidate-scan misses from before this success can't stop the next segment early
        // (the total-skip safety net keeps counting).
        this.navigationSessionSkippedUrls.clear();
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
    const candidate = await this.nextParsedFieldNavigationCandidate(model, navigableFields, delta, jumpDistance);
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
    minDistance: number,
  ): Promise<AdjacentParsedFieldUrlCandidate | null> {
    // Primary stop: a dead run ends after a few consecutive misses instead of probing the whole
    // scan window — each miss is a real remote request (#287). The outer total cap bounds the
    // drain as a whole, so a run of bad URLs stops instead of chasing the frontier forever (the
    // base can advance to each failed URL).
    if (this.navigationSessionSkippedUrls.size >= this.consecutiveMissShortCircuit()) return null;
    if (this.navigationSessionTotalSkips >= MAX_PARSED_NAVIGATION_SKIP_ATTEMPTS) return null;
    const all = adjacentParsedFieldUrlCandidates(model, fields, NEIGHBOR_PRELOAD_FILL_SCAN_LIMIT)
      .filter((candidate) => candidate.direction === direction)
      .sort((a, b) => a.distance - b.distance);
    // A coalesced jump (#373) starts the scan at the net queued distance so one load lands the
    // user's whole burst; skip-forward past failed URLs continues from there. A jump beyond the
    // scan window clamps to the farthest generated candidates (nearer ones first among those).
    const atOrBeyond = all.filter((candidate) => candidate.distance >= minDistance);
    const candidates = atOrBeyond.length > 0 || all.length === 0 ? atOrBeyond : [...all].reverse();
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
