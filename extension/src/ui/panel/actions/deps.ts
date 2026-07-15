import type { KeyboardRouter } from '../../../content/keyboard.js';
import type { PageAdapter, TargetSelectionSnapshot } from '../../../content/page-adapter.js';
import type { PlaintextLocalSettings } from '../../../content/panel-services.js';
import type { Retry404 } from '../../../core/automation/retry-404.js';
import type { Slideshow } from '../../../core/automation/slideshow.js';
import type { ImageProbeMethod } from '../../../core/image/request-policy.js';
import type { CaptureRetryRequest, CaptureSourceType } from '../../../core/image/capture-result.js';
import type { LoadFailureFeedback } from '../../../core/settings.js';
import type { FieldTransformPanelAction, PanelAction, PanelDestinationId, PanelState } from '../../../core/types.js';
import type { PageContext } from '../../../core/page-context.js';
import type { BufferedNavigationController } from '../buffered-navigation-controller.js';
import type { CurrentImageFeedbackTone } from '../current-image-workflows.js';
import type { PanelMount } from '../panel-mount.js';
import type { ParsedFieldStateSync } from '../parsed-field-state-sync.js';
import type { RecallExportController } from '../recall-export-controller.js';
import type { RecallRestoreController } from '../recall-restore-controller.js';
import type { UrlTemplateSettingsController } from '../url-template-settings-controller.js';

/**
 * Everything the panel action handlers may reach on `ImageTrailPanel`, expressed as lazy callbacks
 * so the registry modules stay instantiable in tests with plain fakes. `ImageTrailPanel` wires each
 * member as an arrow closure over `this` (see `createActionDeps` in `panel.ts`), the same pattern as
 * the extracted controllers' `…Deps` interfaces.
 *
 * Builders must never call a member at registry-build time — only inside a `handle` body. The
 * registry is built in a field initializer, before the constructor assigns collaborators like the
 * keyboard router; laziness is what makes that ordering safe.
 */
export interface PanelActionDeps {
  // State access. `reduce` runs `reducePanelAction` and stores the result; `syncTargetState` wraps
  // the panel-private `toTargetState` + core `setTargetState` pair so those helpers stay unexported.
  getState(): PanelState;
  reduce(action: PanelAction): void;
  applyPanelState(nextState: PanelState, options?: { readonly saveParsedFieldState?: boolean; readonly render?: boolean }): boolean;
  syncTargetState(snapshot: TargetSelectionSnapshot): void;

  // Render variants — these are distinct on purpose (see ui/CLAUDE.md: no full panel rerenders for
  // recall-only updates); each handler must keep calling exactly the variant the if-chain used.
  render(): void;
  renderPanelAndRefreshRecall(): void;
  refreshRecallIfOpen(): void;
  clearRecallMessageTimer(): void;
  showFeedback(message: string, tone?: CurrentImageFeedbackTone): void;

  // Local settings.
  getLocalSettings(): PlaintextLocalSettings;
  saveLocalSettings(settings: PlaintextLocalSettings): void;
  applyBuildInfoOverlayVisibility(visible: boolean): void;
  updatePageContextOverride(context: PageContext | null): void;

  // Collaborators, as lazy whole-object getters.
  pageAdapter(): PageAdapter;
  panelMount(): PanelMount;
  keyboard(): KeyboardRouter;
  slideshow(): Slideshow;
  retry(): Retry404;
  fieldStateSync(): ParsedFieldStateSync;
  bufferedNav(): BufferedNavigationController;
  urlTemplateSettings(): UrlTemplateSettingsController;
  recallExport(): RecallExportController;
  recallRestore(): RecallRestoreController;

  // Panel-private workflows, signatures copied from `panel.ts`.
  bookmarkCurrentImage(): Promise<boolean>;
  removeRecentHistory(id: string): Promise<void>;
  deleteRecentHistory(): Promise<void>;
  pinRecentHistory(id: string): Promise<void>;
  loadBookmark(id: string): Promise<void>;
  removeBookmark(id: string): Promise<void>;
  openDestination(destination: PanelDestinationId): Promise<void>;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  refreshBookmarkThumbnails(): Promise<void>;
  deleteVisibleBookmarks(): Promise<void>;
  deleteRecallBookmarks(): Promise<void>;
  updateVisibleBookmarkSoftMax(value: number): Promise<void>;
  updateRecentHistoryRetention(input: {
    readonly limit: number;
    readonly retainedLimit: number;
    readonly overflowBehavior: PlaintextLocalSettings['recentHistoryOverflowBehavior'];
  }): Promise<void>;
  updateRecentSparseRowDisplayMode(mode: PlaintextLocalSettings['recentSparseRowDisplayMode']): void;
  updateDownArrowAction(value: PlaintextLocalSettings['downArrowAction']): void;
  updatePinSaveStoragePreference(value: PlaintextLocalSettings['pinSaveStoragePreference']): void;
  updateUrlReviewStatusRetention(limit: number, clearAfterExport: boolean): Promise<void>;
  updateRequestThrottle(minimumIntervalMs: number, maxRequests: number, windowMs: number): void;
  updateNeighborPreload(
    enabled: boolean,
    radius: number,
    cacheLimit: number,
    probeMethod: ImageProbeMethod,
    loadFailureFeedback: LoadFailureFeedback,
  ): void;
  preloadMoreNeighbors(radius: number, cacheLimit: number): void;
  resetPanelPosition(): Promise<void>;
  updateWorkspaceLayoutRestore(enabled: boolean): void;
  resetWorkspaceLayout(): Promise<void>;
  notifyWorkspaceLayoutChanged(): void;
  prepareDetachedWorkspaceSection(
    sectionId: import('../../../core/workspace-layout.js').DetachableSectionId,
    rect?: import('../../../core/workspace-layout.js').WorkspaceFloatingRect,
  ): void;
  restoreWorkspaceSection(sectionId: import('../../../core/workspace-layout.js').DetachableSectionId): void;
  moveWorkspaceSection(
    sectionId: import('../../../core/workspace-layout.js').DetachableSectionId,
    rect: import('../../../core/workspace-layout.js').WorkspaceFloatingRect,
  ): void;
  snapWorkspaceSection(
    sectionId: import('../../../core/workspace-layout.js').DetachableSectionId,
    edge: import('../../../core/workspace-layout.js').WorkspaceRailEdge,
  ): void;
  shadeWorkspaceSection(sectionId: import('../../../core/workspace-layout.js').DetachableSectionId): void;
  reorderWorkspaceSection(
    sectionId: import('../../../core/workspace-layout.js').DetachableSectionId,
    edge: import('../../../core/workspace-layout.js').WorkspaceRailEdge,
    order: number,
  ): void;
  refreshStorageUsage(options?: { readonly render?: boolean }): Promise<void>;
  restoreParsedFieldStateForCurrentPanel(): void;
  openRecallDestination(): Promise<void>;
  reloadRecallCandidates(): void;
  loadRecallCandidates(input: { readonly offset: number; readonly append: boolean }): Promise<void>;
  recallSelectedRecords(): Promise<void>;
  enqueueFieldTransform(action: FieldTransformPanelAction): void;
  enqueueRejectedFieldCommit(): void;
  enqueueSelectedUrlApply(url: string): void;
  rejectUrlEditorInput(): void;
  captureImage(
    url: string,
    sourceType: CaptureSourceType,
    sourceRecordId?: string,
  ): Promise<import('../../../core/image/capture-result.js').CaptureResult | null>;
  repairMissingOriginals(ids: readonly string[]): Promise<void>;
  retryCaptureWithPermission(request: CaptureRetryRequest): Promise<void>;
  deleteCapturedBlob(recordId: string, blobId: string): Promise<void>;
  cleanupOrphanedBlobs(): Promise<void>;
  previewRecord(url: string, blobId?: string, scrollAnchorId?: string): Promise<void>;
  clearUrlReviewStatus(scope: 'hostname' | 'page' | 'source' | 'all'): Promise<void>;
  navigateBy(delta: 1 | -1): void;
  cancelQueuedSlideshowNavigation(): void;
  cancelQueuedManualNavigation(): void;
}
