import { recordHasStoredOriginal } from '../../core/display-records.js';
import type { CaptureResult } from '../../core/image/capture-result.js';
import type { PanelState } from '../../core/types.js';

export type CurrentImageFeedbackTone = 'success' | 'warning' | 'error';

export interface CurrentImageWorkflowDeps {
  getState(): PanelState;
  bookmarkCurrentImage(): Promise<boolean>;
  captureImage(url: string): Promise<CaptureResult | null>;
  showFeedback(message: string, tone?: CurrentImageFeedbackTone): void;
}

export async function captureCurrentImageWithFeedback(deps: CurrentImageWorkflowDeps, requestedUrl?: string): Promise<void> {
  const state = deps.getState();
  const url = requestedUrl ?? state.target.selectedUrl;
  if (!url) {
    deps.showFeedback('Select an image first.', 'warning');
    return;
  }
  if (state.captureInProgress) {
    deps.showFeedback('Capture already in progress.', 'warning');
    return;
  }
  if (!state.blobKeyUnlocked) {
    const pinned = await deps.bookmarkCurrentImage();
    deps.showFeedback(
      pinned ? 'Pinned — unlock encryption to store the original' : 'Could not pin the current image.',
      pinned ? 'success' : 'error',
    );
    return;
  }
  const result = await deps.captureImage(url);
  const stored = deps.getState().bookmarks.some((record) => record.url === url && recordHasStoredOriginal(record));
  const captured = result?.status === 'captured' || stored;
  deps.showFeedback(captured ? 'Captured original ✓' : 'Could not capture the current image.', captured ? 'success' : 'error');
}

export async function pinCurrentImageWithFeedback(deps: CurrentImageWorkflowDeps): Promise<void> {
  if (!deps.getState().target.selectedUrl) {
    deps.showFeedback('Select an image first.', 'warning');
    return;
  }
  const pinned = await deps.bookmarkCurrentImage();
  deps.showFeedback(pinned ? 'Pinned current image ✓' : 'Could not pin the current image.', pinned ? 'success' : 'error');
}
