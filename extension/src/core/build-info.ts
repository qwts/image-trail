export type BuildIdentityMode = 'local' | 'release' | 'unknown';

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
    (candidate.mode === 'local' || candidate.mode === 'release' || candidate.mode === 'unknown')
  );
}
