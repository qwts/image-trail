import type { ImageDisplayRecord } from '../../core/display-records.js';
import type { RecentHistoryScope } from '../../core/recent-history-scope.js';
import type { PanelState } from '../../core/types.js';

export interface RecentHistoryMutationProjection {
  readonly scope: RecentHistoryScope;
  readonly includeRetained: boolean;
}

export function recentHistoryMutationProjection(state: PanelState): RecentHistoryMutationProjection {
  return { scope: state.recentHistoryScope, includeRetained: state.reviewingRecentSession };
}

export function recentHistoryMutationIsCurrent(state: PanelState, projection: RecentHistoryMutationProjection): boolean {
  return state.recentHistoryScope === projection.scope && state.reviewingRecentSession === projection.includeRetained;
}

export function recentHistoryAfterMutation(
  state: PanelState,
  projection: RecentHistoryMutationProjection,
  history: readonly ImageDisplayRecord[],
  limit = Number.POSITIVE_INFINITY,
): readonly ImageDisplayRecord[] {
  return recentHistoryMutationIsCurrent(state, projection) ? history.slice(0, limit) : state.history;
}
