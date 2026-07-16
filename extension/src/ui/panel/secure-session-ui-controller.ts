import type { CaptureStore } from '../../content/capture-controller.js';
import { reducePanelAction } from '../../core/actions.js';
import type { PanelState } from '../../core/types.js';

export interface SecureSessionUiControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  renderPanelAndRefreshRecall(): void;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  captureStore(): CaptureStore | null;
}

/** Applies secure-session results to panel state without exposing key material to the UI. */
export class SecureSessionUiController {
  constructor(private readonly deps: SecureSessionUiControllerDeps) {}

  async setup(password: string): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return;
    const result = await captureStore.setupBlobKey(password);
    this.applyResult(result.message, result.ok, result.ok ? result.keyReference : null, result.ok);
    await this.finishUnlock(result.ok);
  }

  async unlock(password: string): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return;
    const result = await captureStore.unlockBlobKey(password);
    this.applyResult(result.message, result.ok, result.ok ? result.keyReference : null, this.deps.getState().blobKeyAvailable);
    await this.finishUnlock(result.ok);
  }

  async lock(): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return;
    const result = await captureStore.lockBlobKey();
    this.applyResult(result.message, result.ok, null, true);
    this.deps.render();
  }

  async refresh(): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return;
    const result = await captureStore.requestBlobKeyStatus();
    const state = result.message
      ? { ...this.deps.getState(), message: result.message, status: 'ready' as const, lastUpdatedAt: Date.now() }
      : this.deps.getState();
    this.deps.setState(
      reducePanelAction(state, {
        name: 'blob-key/status',
        unlocked: result.unlocked,
        keyReference: result.keyReference,
        hasKey: result.hasKey,
        message: result.message,
      }),
    );
    this.deps.render();
  }

  private applyResult(message: string, ok: boolean, keyReference: string | null, hasKey: boolean): void {
    this.deps.setState(
      reducePanelAction(
        { ...this.deps.getState(), message, status: ok ? 'ready' : 'error', lastUpdatedAt: Date.now() },
        { name: 'blob-key/status', unlocked: ok && keyReference !== null, keyReference, hasKey, message },
      ),
    );
  }

  private async finishUnlock(ok: boolean): Promise<void> {
    if (!ok) {
      this.deps.render();
      return;
    }
    await this.deps.loadBookmarkPage(this.deps.getState().bookmarkOffset, { render: false });
    this.deps.renderPanelAndRefreshRecall();
  }
}
