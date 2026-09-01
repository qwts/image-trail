export type BuildIdentityMode = 'experimental' | 'local' | 'release' | 'unknown';

export interface BuildIdentity {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly builtAt: string;
  readonly commit: string | null;
  readonly branch: string | null;
  readonly worktree: string | null;
  readonly timezone?: string | null;
  readonly mode: BuildIdentityMode;
}

export function isBuildIdentity(value: unknown): value is BuildIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof BuildIdentity, unknown>>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.version === 'string' &&
    typeof candidate.builtAt === 'string' &&
    (typeof candidate.commit === 'string' || candidate.commit === null) &&
    (typeof candidate.branch === 'string' || candidate.branch === null) &&
    (typeof candidate.worktree === 'string' || candidate.worktree === null) &&
    (typeof candidate.timezone === 'string' || candidate.timezone === null || candidate.timezone === undefined) &&
    (candidate.mode === 'experimental' || candidate.mode === 'local' || candidate.mode === 'release' || candidate.mode === 'unknown')
  );
}

export function isNonProductionBuildIdentity(buildIdentity: BuildIdentity | null): buildIdentity is BuildIdentity {
  return !!buildIdentity && buildIdentity.mode !== 'release';
}

export function buildIdentityRows(buildIdentity: BuildIdentity): readonly { readonly label: string; readonly value: string }[] {
  const rows: { readonly label: string; readonly value: string }[] = [
    { label: 'Version', value: buildIdentity.version },
    { label: 'Mode', value: buildIdentity.mode },
  ];
  if (buildIdentity.commit) rows.push({ label: 'Commit', value: buildIdentity.commit });
  if (buildIdentity.branch) rows.push({ label: 'Branch', value: buildIdentity.branch });
  if (buildIdentity.worktree) rows.push({ label: 'Worktree', value: buildIdentity.worktree });
  rows.push({ label: 'Built local', value: formatBuildIdentityLocalTimestamp(buildIdentity.builtAt, buildIdentity.timezone) });
  rows.push({ label: 'Built UTC', value: formatBuildIdentityTimestamp(buildIdentity.builtAt) });
  return rows;
}

export function formatBuildIdentityLocalTimestamp(value: string, timezone?: string | null): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(timestamp));
  } catch {
    return value;
  }
}

export function formatBuildIdentityTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/u, ' UTC');
}
