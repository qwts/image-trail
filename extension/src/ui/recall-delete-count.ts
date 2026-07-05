import type { PanelState } from '../core/types.js';

export function recallDeleteCountForQueue(state: Pick<PanelState, 'bookmarkTotal' | 'bookmarkLimit'>): number {
  return Math.max(0, state.bookmarkTotal - state.bookmarkLimit);
}
