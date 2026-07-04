import { DEFAULT_LOCAL_SETTINGS } from '../../content/panel-services.js';
import type { RecallStore } from '../../content/recall-store.js';
import { reducePanelAction } from '../../core/actions.js';
import type { PanelState } from '../../core/types.js';

const RECALL_DRAWER_OPEN_ANIMATION_MS = 190;
const RECALL_SUCCESS_MESSAGE_MS = 1800;

export interface RecallDrawerControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  renderRecallOnly(): void;
  renderPanelAndRefreshRecall(): void;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  ensurePanelPositionRestored(): Promise<void>;
  refreshBlobKeyStatus(): Promise<void>;
  root(): HTMLElement | null;
  recallStore(): RecallStore | null;
}

/**
 * Recall-drawer open/load/select lifecycle, moved verbatim off `ImageTrailPanel`: the drawer-open
 * animation window (`recallOpeningUntil` defers the busy render until the open animation settles),
 * candidate paging, the success-message clear timer, and the recall-selected flow. Export/restore
 * live in `RecallExportController`/`RecallRestoreController`; this controller reaches them only
 * through panel-mediated deps callbacks (`refreshBlobKeyStatus`). Each path deliberately uses
 * `renderRecallOnly` vs `render` per the ui/ "avoid full panel rerenders" rule — preserve which
 * variant each one calls.
 */
export class RecallDrawerController {
  private recallOpeningUntil = 0;
  private recallMessageClearTimer: number | null = null;

  constructor(private readonly deps: RecallDrawerControllerDeps) {}

  async openRecallDrawer(): Promise<void> {
    await this.deps.ensurePanelPositionRestored();
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'recall/open', side: this.recallDrawerSide() }));
    this.recallOpeningUntil = Date.now() + RECALL_DRAWER_OPEN_ANIMATION_MS;
    this.deps.render();
    if (!this.deps.recallStore()) {
      return;
    }
    void this.loadRecallCandidates({
      offset: this.deps.getState().bookmarkLimit || DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
      append: false,
    });
  }

  private recallDrawerSide(): 'left' | 'right' {
    const root = this.deps.root();
    if (!root) return 'right';
    const rect = root.getBoundingClientRect();
    const leftSpace = rect.left;
    const rightSpace = window.innerWidth - rect.right;
    return rightSpace >= 360 || rightSpace >= leftSpace ? 'right' : 'left';
  }

  async loadRecallCandidates(input: {
    readonly offset: number;
    readonly append: boolean;
    readonly renderScope?: 'panel' | 'recall';
    readonly showBusy?: boolean;
  }): Promise<void> {
    const recallStore = this.deps.recallStore();
    if (!recallStore) return;
    const renderUpdatedRecall = input.renderScope === 'panel' ? () => this.deps.render() : () => this.deps.renderRecallOnly();
    let pending = true;
    if (input.showBusy !== false) {
      this.clearRecallMessageTimer();
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'recall/load-start' }));
      if (this.isRecallOpening()) {
        void this.waitForRecallOpening().then(() => {
          if (pending && this.deps.getState().recall.busy) renderUpdatedRecall();
        });
      } else {
        renderUpdatedRecall();
      }
    }
    const result = await recallStore.loadCandidates({
      offset: input.offset,
      limit: 100,
      scope: this.deps.getState().bookmarkVisibilityScope,
      currentPageUrl: window.location.href,
    });
    pending = false;
    await this.waitForRecallOpening();
    if (!result.ok) {
      this.clearRecallMessageTimer();
      if (result.reason === 'encryption-locked') await this.deps.refreshBlobKeyStatus();
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'recall/error', message: result.message }));
      renderUpdatedRecall();
      return;
    }
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'recall/load-complete',
        candidates: result.candidates,
        append: input.append,
        offset: input.offset,
        nextOffset: result.nextOffset,
        hasMore: result.hasMore,
        total: result.total,
        failedCount: result.failedCount,
        message: result.message,
      }),
    );
    this.scheduleRecallMessageClear(result.message);
    renderUpdatedRecall();
  }

  private isRecallOpening(): boolean {
    return Date.now() < this.recallOpeningUntil;
  }

  private async waitForRecallOpening(): Promise<void> {
    const remaining = this.recallOpeningUntil - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve) => window.setTimeout(resolve, remaining));
  }

  refreshRecallIfOpen(): void {
    if (!this.deps.getState().recall.open) return;
    void this.loadRecallCandidates({
      offset: this.deps.getState().bookmarkLimit || DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
      append: false,
      showBusy: false,
    });
  }

  private scheduleRecallMessageClear(message: string): void {
    this.clearRecallMessageTimer();
    this.recallMessageClearTimer = window.setTimeout(() => {
      this.recallMessageClearTimer = null;
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'recall/message-clear', message }));
      this.deps.renderRecallOnly();
    }, RECALL_SUCCESS_MESSAGE_MS);
  }

  clearRecallMessageTimer(): void {
    if (this.recallMessageClearTimer === null) return;
    window.clearTimeout(this.recallMessageClearTimer);
    this.recallMessageClearTimer = null;
  }

  async recallSelectedRecords(): Promise<void> {
    const recallStore = this.deps.recallStore();
    if (!recallStore || this.deps.getState().recall.selectedIds.length === 0) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'recall/load-start' }));
    this.deps.renderRecallOnly();
    const result = await recallStore.recall(this.deps.getState().recall.selectedIds);
    if (!result.ok) {
      if (result.reason === 'encryption-locked') await this.deps.refreshBlobKeyStatus();
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'recall/error', message: result.message }));
      this.deps.renderRecallOnly();
      return;
    }
    await this.deps.loadBookmarkPage(0, { render: false });
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'recall/complete',
        records: result.records,
        failedCount: result.failedCount,
        message: result.message,
      }),
    );
    this.deps.renderPanelAndRefreshRecall();
  }
}
