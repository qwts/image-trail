import type { PanelState } from '../../core/types.js';

function addItems(items: readonly string[], nextItems: readonly string[]): readonly string[] {
  return [...items, ...nextItems.filter((item) => !items.includes(item))];
}

function removeItems(items: readonly string[], removedItems: readonly string[]): readonly string[] {
  if (removedItems.length === 0) return items;
  const removed = new Set(removedItems);
  return items.filter((item) => !removed.has(item));
}

export function fieldLoadResultState(
  state: PanelState,
  attemptedFieldIds: readonly string[],
  nextFingerprint: string | null,
  previousFingerprint: string | null,
  isAutoUnlockable: (fieldId: string) => boolean,
): PanelState {
  const changed = Boolean(nextFingerprint && previousFingerprint && nextFingerprint !== previousFingerprint);
  const unchanged = Boolean(nextFingerprint && previousFingerprint && nextFingerprint === previousFingerprint);
  const autoUnlocked = changed
    ? attemptedFieldIds.filter((fieldId) => isAutoUnlockable(fieldId) && !state.manuallyExcludedFieldIds.includes(fieldId))
    : [];

  return {
    ...state,
    failedFieldId: null,
    successfulFieldIds: changed
      ? addItems(removeItems(state.successfulFieldIds, attemptedFieldIds), attemptedFieldIds)
      : removeItems(state.successfulFieldIds, attemptedFieldIds),
    unchangedFieldIds: unchanged
      ? addItems(removeItems(state.unchangedFieldIds, attemptedFieldIds), attemptedFieldIds)
      : removeItems(state.unchangedFieldIds, attemptedFieldIds),
    unlockedFieldIds: changed ? addItems(removeItems(state.unlockedFieldIds, attemptedFieldIds), autoUnlocked) : state.unlockedFieldIds,
    currentImageFingerprint: nextFingerprint ?? state.currentImageFingerprint,
  };
}
