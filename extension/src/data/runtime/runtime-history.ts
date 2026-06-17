import { createDisplayRecord, type ImageDisplayRecord } from '../../core/display-records.js';

export const DEFAULT_VISIBLE_HISTORY_LIMIT = 30;
export const DEFAULT_RUNTIME_HISTORY_LIMIT = 200;

export interface RuntimeHistoryState {
  readonly items: readonly ImageDisplayRecord[];
  readonly visibleLimit: number;
  readonly runtimeLimit: number;
}

export type RuntimeHistoryAction =
  | {
      readonly name: 'history/add-loaded';
      readonly item: Omit<ImageDisplayRecord, 'id' | 'timestamp' | 'label'> &
        Partial<Pick<ImageDisplayRecord, 'id' | 'timestamp' | 'label'>>;
    }
  | { readonly name: 'history/remove'; readonly id: string }
  | { readonly name: 'history/restore'; readonly item: ImageDisplayRecord };

export function createRuntimeHistoryState(
  visibleLimit = DEFAULT_VISIBLE_HISTORY_LIMIT,
  runtimeLimit = DEFAULT_RUNTIME_HISTORY_LIMIT,
): RuntimeHistoryState {
  return { items: [], visibleLimit, runtimeLimit };
}

export function getVisibleHistory(state: RuntimeHistoryState): readonly ImageDisplayRecord[] {
  return state.items.slice(0, state.visibleLimit);
}

export function reduceRuntimeHistory(state: RuntimeHistoryState, action: RuntimeHistoryAction): RuntimeHistoryState {
  switch (action.name) {
    case 'history/add-loaded': {
      const item = createDisplayRecord({ ...action.item, source: 'history' });
      const deduped = state.items.filter((entry) => entry.url !== item.url && entry.id !== item.id);
      return { ...state, items: [item, ...deduped].slice(0, state.runtimeLimit) };
    }
    case 'history/remove':
      return { ...state, items: state.items.filter((entry) => entry.id !== action.id) };
    case 'history/restore':
      return { ...state, items: [action.item, ...state.items.filter((entry) => entry.id !== action.item.id)].slice(0, state.runtimeLimit) };
  }
}
