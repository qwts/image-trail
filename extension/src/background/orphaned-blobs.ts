export const ORPHANED_BLOB_GRACE_PERIOD_MS = 60 * 60 * 1000;
const CANONICAL_ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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
      if (!CANONICAL_ISO_TIMESTAMP_PATTERN.test(blob.createdAt)) return false;
      const createdAt = Date.parse(blob.createdAt);
      return Number.isFinite(createdAt) && new Date(createdAt).toISOString() === blob.createdAt && createdAt <= graceCutoff;
    })
    .map((blob) => blob.id);
}
