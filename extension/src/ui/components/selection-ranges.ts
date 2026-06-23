export function selectedRangeIds(orderedIds: readonly string[], selectedIds: readonly string[], targetId: string): readonly string[] {
  const targetIndex = orderedIds.indexOf(targetId);
  if (targetIndex === -1) return [targetId];
  const anchorId = [...selectedIds].reverse().find((id) => orderedIds.includes(id));
  if (!anchorId) return [targetId];
  const anchorIndex = orderedIds.indexOf(anchorId);
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return orderedIds.slice(start, end + 1);
}
