import type { CaptureStore } from '../../content/capture-controller.js';
import type { PageAdapter, TargetSelectionSnapshot } from '../../content/page-adapter.js';
import { applyFieldLoadFailureToState } from '../../core/actions.js';
import type { ImageRequestIntent } from '../../core/image/request-policy.js';
import { imageResourceUrlsEqual, pushVisibleUrlWhenSameOrigin } from '../../core/image/image-navigation.js';
import type { ProjectionSessionController, ProjectionReason, ProjectionSession } from '../../core/projection-session.js';
import { setTargetState } from '../../core/state.js';
import type { PanelState, TargetState, UrlReviewStatus } from '../../core/types.js';
import type { NeighborPreloadDirection } from '../../core/url/preload-neighbors.js';
import type { NeighborPreloadController } from './neighbor-preload-controller.js';

// Field-load (parsed-field navigation) errors are transient and should clear quickly; arrow / next
// / prev traversal mutes them entirely (see applySelectedUrl's quietFailure), while the +/- single
// step surfaces them for only about this long.
const FIELD_LOAD_ERROR_DISPLAY_MS = 1500;

export function urlReviewStatusForLoadResult(nextFingerprint: string | null, previousFingerprint: string | null): UrlReviewStatus | null {
  if (!nextFingerprint || !previousFingerprint) return null;
  return nextFingerprint === previousFingerprint ? 'unchanged' : 'passed';
}

export function toTargetState(snapshot: TargetSelectionSnapshot): TargetState {
  const selectedUrl = snapshot.selected?.url ?? null;
  return {
    mode: snapshot.mode,
    picking: snapshot.picking,
    grabModeActive: snapshot.grabModeActive,
    candidateCount: snapshot.candidateCount,
    selectedUrl: selectedUrl?.startsWith('data:') ? 'data:' : selectedUrl,
    selectedHandleId: snapshot.selected?.handleId ?? null,
    selectedDimensions: snapshot.selected ? `${snapshot.selected.width}×${snapshot.selected.height}` : null,
    fillScreen: snapshot.fillScreen,
    objectFit: snapshot.objectFit,
    message: snapshot.message,
  };
}

export function projectionSessionOwnsSelectedTarget(session: ProjectionSession, selectedHandleId: string | null): boolean {
  return session.selectedHandleId === selectedHandleId;
}

export interface ProjectionApplicationControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  loadGrabSettings(): Promise<void>;
  scheduleFiniteCaptureErrorReset(updatedAt: number, mode: 'status', durationMs?: number): void;
  saveFieldState(): Promise<void>;
  setExtensionProjectedPageUrl(pageUrl: string): void;
  refreshBufferedNavPreloads(): void;
  primeBufferedNav(): void;
  refreshBlobKeyStatus(): Promise<void>;
  saveUrlReviewStatus(status: UrlReviewStatus, sourceUrl: string, fieldIds: readonly string[], reason?: string): Promise<void>;
  // Shared field-state helpers stay panel-owned — the parsed-field navigation queue uses them too.
  currentKnownImageFingerprint(): string | null;
  applyFieldLoadResult(
    state: PanelState,
    attemptedFieldIds: readonly string[],
    nextFingerprint: string | null,
    previousFingerprint: string | null,
  ): PanelState;
  pruneInvalidFieldSplitSpecsForUrl(state: PanelState, url: string, options?: { readonly preserveMessage?: boolean }): PanelState;
  parsedFieldRequestContextKey(
    attemptedFieldIds: readonly string[],
    direction: NeighborPreloadDirection | undefined,
    runId: number,
  ): string;
  currentSelectedUrl(): string | null;
  projectedSourceUrl(): string | null;
  findSelectedImage(handleId: string): HTMLImageElement | null;
  // Collaborators are Pick-typed so test fakes compile despite the classes' private members.
  projections(): Pick<ProjectionSessionController, 'beginGuarded' | 'update' | 'isActive'>;
  neighborPreload(): Pick<NeighborPreloadController, 'preload' | 'runId'>;
  pageAdapter(): Pick<PageAdapter, 'getSnapshot' | 'applyUrlToSelected'>;
  captureStore(): CaptureStore | null;
}

/**
 * Projection-session and selected-URL application flows, moved verbatim off `ImageTrailPanel`:
 * the loop-guarded session begin/staleness/apply core, the `applySelectedUrl` load path that
 * every navigation flow funnels through, and the record/URL preview family. The parsed-field
 * navigation queue stays on the panel as a consumer of the public session methods; every async
 * boundary re-checks `isCurrentProjectionSession` before touching state or the DOM.
 */
export class ProjectionApplicationController {
  private previewScrollAnchorIdValue: string | null = null;

  constructor(private readonly deps: ProjectionApplicationControllerDeps) {}

  /** Recents-row scroll anchor for the in-flight preview; read by the panel render paths. */
  get previewScrollAnchorId(): string | null {
    return this.previewScrollAnchorIdValue;
  }

  async applySelectedUrl(
    nextUrl: string,
    attemptedFieldIds: readonly string[] = [],
    options: {
      readonly pushVisibleUrl?: boolean;
      readonly reason?: ProjectionReason;
      readonly preloadDirection?: NeighborPreloadDirection;
      readonly resetFieldState?: boolean;
      readonly quietFailure?: boolean;
    } = {},
  ): Promise<boolean> {
    const session = this.beginProjectionSession(options.reason ?? this.applySelectedUrlReason(attemptedFieldIds), nextUrl);
    if (!session) return false;
    if (options.resetFieldState) this.deps.setState(this.resetParsedFieldInteractionState(this.deps.getState()));
    const baselineFingerprint = this.deps.currentKnownImageFingerprint();
    this.deps.projections().update(session, { status: 'preloading' });
    const preload = await this.deps.neighborPreload().preload(nextUrl, {
      readCache: session.reason !== 'parsed-field-navigation',
      writeCache: session.reason !== 'parsed-field-navigation',
      intent: this.imageRequestIntentForProjectionReason(session.reason),
      contextKey:
        session.reason === 'parsed-field-navigation'
          ? this.deps.parsedFieldRequestContextKey(attemptedFieldIds, options.preloadDirection, this.deps.neighborPreload().runId)
          : undefined,
    });
    if (!this.isCurrentProjectionSession(session)) return false;
    if (!preload.ok) {
      this.deps.projections().update(session, { status: 'failed' });
      const failedState = this.deps.pruneInvalidFieldSplitSpecsForUrl(
        applyFieldLoadFailureToState(this.deps.getState(), { draftUrl: nextUrl, attemptedFieldIds, message: preload.message }),
        nextUrl,
        { preserveMessage: true },
      );
      // Arrow / next / prev traversal skips past bad URLs, so it mutes the alert: keep the failure in
      // field/review state (which drives the skip) but leave the previous status/message so we don't
      // flash a red error or churn the panel on every skipped image. The +/- single step still shows
      // the error, briefly.
      if (options.quietFailure) {
        const state = this.deps.getState();
        this.deps.setState({ ...failedState, status: state.status, message: state.message, lastUpdatedAt: state.lastUpdatedAt });
      } else {
        this.deps.setState(failedState);
        this.deps.scheduleFiniteCaptureErrorReset(this.deps.getState().lastUpdatedAt, 'status', FIELD_LOAD_ERROR_DISPLAY_MS);
        this.deps.render();
      }
      void this.deps.saveUrlReviewStatus('failed', nextUrl, attemptedFieldIds, preload.message);
      void this.deps.saveFieldState();
      if (session.reason === 'parsed-field-navigation') this.deps.refreshBufferedNavPreloads();
      return false;
    }

    const reviewStatus = urlReviewStatusForLoadResult(preload.sha256, baselineFingerprint);
    if (attemptedFieldIds.length > 0 && reviewStatus === 'unchanged') {
      this.deps.projections().update(session, { status: 'loaded', displayUrl: preload.displayUrl });
      this.deps.setState(
        this.deps.pruneInvalidFieldSplitSpecsForUrl(
          this.deps.applyFieldLoadResult(
            {
              ...this.deps.getState(),
              draftUrl: nextUrl,
              message: 'Image loaded but did not change.',
              status: 'ready',
              lastUpdatedAt: Date.now(),
            },
            attemptedFieldIds,
            preload.sha256,
            baselineFingerprint,
          ),
          nextUrl,
          { preserveMessage: true },
        ),
      );
      void this.deps.saveUrlReviewStatus('unchanged', nextUrl, attemptedFieldIds, 'Image loaded but did not change.');
      void this.deps.saveFieldState();
      this.deps.render();
      return false;
    }

    const snapshot = this.deps.pageAdapter().getSnapshot();
    if (snapshot.selected) {
      const nextSnapshot = this.applyProjectionToSelectedImage(session, preload.displayUrl);
      if (!nextSnapshot) return false;
      if (!this.isCurrentProjectionSession(session)) return false;
      this.deps.setState({ ...setTargetState(this.deps.getState(), toTargetState(nextSnapshot)), draftUrl: null });
    }
    this.deps.setState(
      this.deps.pruneInvalidFieldSplitSpecsForUrl(
        this.deps.applyFieldLoadResult(this.deps.getState(), attemptedFieldIds, preload.sha256, baselineFingerprint),
        nextUrl,
        { preserveMessage: true },
      ),
    );
    if (reviewStatus === 'passed') void this.deps.saveUrlReviewStatus(reviewStatus, nextUrl, attemptedFieldIds);
    if (options.pushVisibleUrl && pushVisibleUrlWhenSameOrigin(nextUrl)) this.deps.setExtensionProjectedPageUrl(window.location.href);
    void this.deps.saveFieldState();
    this.deps.render();
    void this.deps.loadGrabSettings();
    if (session.reason === 'parsed-field-navigation') {
      this.deps.primeBufferedNav();
    }
    return true;
  }

  private applySelectedUrlReason(attemptedFieldIds: readonly string[]): ProjectionReason {
    return attemptedFieldIds.length > 0 ? 'parsed-field-navigation' : 'selected-url-apply';
  }

  private imageRequestIntentForProjectionReason(reason: ProjectionReason): ImageRequestIntent {
    switch (reason) {
      case 'parsed-field-navigation':
      case 'parsed-field-restore':
        return 'field-active-navigation';
      case 'bookmark-load':
        return 'bookmark-load';
      case 'record-preview':
        return 'recent-load';
      case 'selected-url-apply':
        return 'url-editor-apply';
    }
  }

  private resetParsedFieldInteractionState(state: PanelState): PanelState {
    return {
      ...state,
      activeFieldId: null,
      failedFieldId: null,
      successfulFieldIds: [],
      unchangedFieldIds: [],
      unlockedFieldIds: [],
      manuallyExcludedFieldIds: [],
      fieldSplitSpecs: [],
      fieldDigitWidthSpecs: [],
    };
  }

  beginProjectionSession(reason: ProjectionReason, sourceUrl: string): ProjectionSession | null {
    const result = this.deps.projections().beginGuarded({
      reason,
      sourceUrl,
      selectedHandleId: this.deps.getState().target.selectedHandleId,
      originalSourceUrl: this.deps.projectedSourceUrl(),
    });
    if (result.ok) return result.session;
    console.warn('Image Trail projection loop guard blocked a repeated host image projection request.', result.warning);
    const state = this.deps.getState();
    this.deps.setState({
      ...state,
      status: 'error',
      message: 'Projection stopped because repeated host image requests looked like a loop.',
      lastUpdatedAt: Date.now(),
    });
    this.deps.render();
    return null;
  }

  isCurrentProjectionSession(session: ProjectionSession): boolean {
    return (
      this.deps.projections().isActive(session) &&
      projectionSessionOwnsSelectedTarget(session, this.deps.getState().target.selectedHandleId)
    );
  }

  applyProjectionToSelectedImage(session: ProjectionSession, displayUrl: string): TargetSelectionSnapshot | null {
    if (!this.isCurrentProjectionSession(session)) return null;
    this.deps.projections().update(session, { status: 'applying', displayUrl });
    const snapshot = this.deps.pageAdapter().applyUrlToSelected(session.sourceUrl, displayUrl, {
      projectionId: session.id,
      projectionReason: session.reason,
    });
    if (!this.isCurrentProjectionSession(session)) return null;
    return snapshot;
  }

  async previewRecord(url: string, blobId?: string, scrollAnchorId?: string): Promise<void> {
    this.previewScrollAnchorIdValue = scrollAnchorId ?? null;
    const captureStore = this.deps.captureStore();
    let session: ProjectionSession | null = null;
    try {
      if ((!blobId || !captureStore) && this.isCurrentSelectedImageUrl(url)) {
        this.applyAlreadyProjectedPreviewMessage();
        return;
      }
      session = this.beginProjectionSession('record-preview', url);
      if (!session) return;
      if (!blobId) {
        await this.previewUrl(url, session);
        return;
      }

      if (!captureStore) {
        await this.previewUrl(url, session);
        return;
      }
      const retrieved = await captureStore.requestRetrieveBlob(blobId);
      if (!this.isCurrentProjectionSession(session)) return;
      if (!retrieved.ok) {
        if (retrieved.reason === 'encryption-locked') await this.deps.refreshBlobKeyStatus();
        if (!this.isCurrentProjectionSession(session)) return;
        this.deps.projections().update(session, { status: 'failed' });
        const state = this.deps.getState();
        this.deps.setState({ ...state, message: retrieved.message, status: 'error', lastUpdatedAt: Date.now() });
        this.deps.render();
        return;
      }

      if (await this.projectUrlToSelectedImage(retrieved.dataUrl, session)) {
        if (!this.isCurrentProjectionSession(session)) return;
        const state = this.deps.getState();
        this.deps.setState({
          ...state,
          message: `Projected encrypted original (${(retrieved.byteLength / 1024).toFixed(1)} KB).`,
          lastUpdatedAt: Date.now(),
        });
        this.deps.render();
        return;
      }

      if (!this.isCurrentProjectionSession(session)) return;
      this.deps.projections().update(session, { status: 'failed' });
      const state = this.deps.getState();
      this.deps.setState({
        ...state,
        message: 'Select a host image before previewing encrypted originals.',
        status: 'error',
        lastUpdatedAt: Date.now(),
      });
      this.deps.render();
    } finally {
      if (!session || this.isCurrentProjectionSession(session)) this.previewScrollAnchorIdValue = null;
    }
  }

  private async previewUrl(url: string, session: ProjectionSession): Promise<void> {
    if (!this.canProjectToSelectedImage()) {
      if (!this.isCurrentProjectionSession(session)) return;
      this.deps.projections().update(session, { status: 'failed' });
      const state = this.deps.getState();
      this.deps.setState({
        ...state,
        message: 'Select a host image before previewing an image.',
        status: 'error',
        lastUpdatedAt: Date.now(),
      });
      this.deps.render();
      return;
    }

    if (await this.projectUrlToSelectedImage(url, session)) {
      if (!this.isCurrentProjectionSession(session)) return;
      const state = this.deps.getState();
      this.deps.setState({ ...state, message: 'Projected image into selected host element.', lastUpdatedAt: Date.now() });
      this.deps.render();
      return;
    }
  }

  private canProjectToSelectedImage(): boolean {
    const handleId = this.deps.getState().target.selectedHandleId;
    return !!handleId && !!this.deps.findSelectedImage(handleId);
  }

  private isCurrentSelectedImageUrl(url: string): boolean {
    return imageResourceUrlsEqual(url, this.deps.currentSelectedUrl(), window.location.href);
  }

  private applyAlreadyProjectedPreviewMessage(): void {
    const state = this.deps.getState();
    this.deps.setState({
      ...state,
      message: 'Recent image is already projected into the selected host element.',
      status: 'ready',
      lastUpdatedAt: Date.now(),
    });
    this.deps.render();
  }

  private async projectUrlToSelectedImage(url: string, session: ProjectionSession): Promise<boolean> {
    const handleId = this.deps.getState().target.selectedHandleId;
    if (!handleId) return false;
    const image = this.deps.findSelectedImage(handleId);
    if (!image) return false;

    this.deps.projections().update(session, { status: 'preloading' });
    const preload = await this.deps.neighborPreload().preload(url, { intent: this.imageRequestIntentForProjectionReason(session.reason) });
    if (!this.isCurrentProjectionSession(session)) return false;
    if (!preload.ok) {
      this.deps.projections().update(session, { status: 'failed' });
      const state = this.deps.getState();
      this.deps.setState({ ...state, message: preload.message, status: 'error', lastUpdatedAt: Date.now() });
      this.deps.scheduleFiniteCaptureErrorReset(this.deps.getState().lastUpdatedAt, 'status');
      this.deps.render();
      return false;
    }

    const snapshot = this.applyProjectionToSelectedImage(session, preload.displayUrl);
    if (!snapshot) return false;
    if (!this.isCurrentProjectionSession(session)) return false;
    this.deps.setState(setTargetState(this.deps.getState(), toTargetState(snapshot)));
    this.deps.render();
    void this.deps.loadGrabSettings();
    return true;
  }
}
