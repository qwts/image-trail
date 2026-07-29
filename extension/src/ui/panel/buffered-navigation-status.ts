import type { LoadFailureFeedback } from '../../core/settings.js';
import {
  summarizeBufferedImageWindow,
  type BufferedImageIndexState,
  type BufferedImageNavigationState,
  type BufferedImageStatusSummary,
} from '../../core/url/buffered-image-navigation.js';

export interface BufferedNavigationDebugSnapshot {
  readonly cursor: number;
  readonly bufferN: number;
  readonly indices: ReadonlyMap<number, BufferedImageIndexState>;
}

export type BufferedNavigationStatusSnapshot = BufferedImageStatusSummary & { readonly failuresVisible: boolean };

export interface BufferedNavigationSnapshots {
  readonly debug: BufferedNavigationDebugSnapshot | null;
  readonly status: BufferedNavigationStatusSnapshot | null;
}

export function toBufferedNavigationSnapshots(
  navigation: BufferedImageNavigationState | null,
  debugVisible: boolean,
  feedback: LoadFailureFeedback,
  statusVisible: boolean,
): BufferedNavigationSnapshots {
  return {
    debug:
      debugVisible && navigation ? { cursor: navigation.cursor, bufferN: navigation.settings.bufferN, indices: navigation.indices } : null,
    status: statusVisible && navigation ? { ...summarizeBufferedImageWindow(navigation), failuresVisible: feedback !== 'mute' } : null,
  };
}
