export const ORPHANED_BLOB_GRACE_PERIOD_MS = 60 * 60 * 1000;

interface OrphanBlobCandidate {
  readonly id: string;
  readonly createdAt: string;
}

export function findDeletableOrphanBlobIds(
  blobs: readonly OrphanBlobCandidate[],
  referencedBlobIds: ReadonlySet<string>,
  now = Date.now(),
): readonly string[] {
  const graceCutoff = now - ORPHANED_BLOB_GRACE_PERIOD_MS;
  return blobs
    .filter((blob) => {
      if (referencedBlobIds.has(blob.id)) return false;
      const createdAt = Date.parse(blob.createdAt);
      return Number.isFinite(createdAt) && createdAt <= graceCutoff;
    })
    .map((blob) => blob.id);
}
