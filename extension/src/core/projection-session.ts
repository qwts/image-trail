export type ProjectionReason =
  'selected-url-apply' | 'parsed-field-navigation' | 'parsed-field-restore' | 'bookmark-load' | 'record-preview';

export type ProjectionSessionStatus = 'idle' | 'preloading' | 'applying' | 'loaded' | 'failed' | 'canceled' | 'superseded';

export interface ProjectionSession {
  readonly id: string;
  readonly reason: ProjectionReason;
  readonly sourceUrl: string;
  readonly displayUrl: string | null;
  readonly selectedHandleId: string | null;
  readonly originalSourceUrl: string | null;
  readonly status: ProjectionSessionStatus;
}

export interface BeginProjectionSessionOptions {
  readonly reason: ProjectionReason;
  readonly sourceUrl: string;
  readonly displayUrl?: string | null;
  readonly selectedHandleId?: string | null;
  readonly originalSourceUrl?: string | null;
}

export interface ProjectionLoopGuardWarning {
  readonly reason: ProjectionReason;
  readonly sourceUrl: string;
  readonly selectedHandleId: string | null;
  readonly originalSourceUrl: string | null;
  readonly repeatedCount: number;
  readonly threshold: number;
  readonly windowMs: number;
}

export type BeginProjectionSessionResult =
  { readonly ok: true; readonly session: ProjectionSession } | { readonly ok: false; readonly warning: ProjectionLoopGuardWarning };

interface ProjectionLoopGuardEntry {
  readonly key: string;
  readonly at: number;
}

const LOOP_GUARD_WINDOW_MS = 1500;
const LOOP_GUARD_THRESHOLD = 6;

export class ProjectionSessionController {
  private sequence = 0;
  private active: ProjectionSession | null = null;
  private readonly loopGuardEntries: ProjectionLoopGuardEntry[] = [];

  begin(options: BeginProjectionSessionOptions): ProjectionSession {
    if (this.active && this.active.status !== 'loaded' && this.active.status !== 'failed') {
      this.active = { ...this.active, status: 'superseded' };
    }
    const session: ProjectionSession = {
      id: `projection-${++this.sequence}`,
      reason: options.reason,
      sourceUrl: options.sourceUrl,
      displayUrl: options.displayUrl ?? null,
      selectedHandleId: options.selectedHandleId ?? null,
      originalSourceUrl: options.originalSourceUrl ?? null,
      status: 'idle',
    };
    this.active = session;
    return session;
  }

  beginGuarded(options: BeginProjectionSessionOptions, now = Date.now()): BeginProjectionSessionResult {
    const warning = this.loopGuardWarning(options, now);
    if (warning) return { ok: false, warning };
    return { ok: true, session: this.begin(options) };
  }

  current(): ProjectionSession | null {
    return this.active;
  }

  isActive(sessionOrId: ProjectionSession | string | null | undefined): boolean {
    if (!sessionOrId || !this.active) return false;
    const id = typeof sessionOrId === 'string' ? sessionOrId : sessionOrId.id;
    return this.active.id === id;
  }

  update(
    sessionOrId: ProjectionSession | string,
    updates: Partial<Pick<ProjectionSession, 'displayUrl' | 'status'>>,
  ): ProjectionSession | null {
    if (!this.isActive(sessionOrId) || !this.active) return null;
    this.active = { ...this.active, ...updates };
    return this.active;
  }

  cancelActive(): ProjectionSession | null {
    if (!this.active) return null;
    this.active = { ...this.active, status: 'canceled' };
    return this.active;
  }

  private loopGuardWarning(options: BeginProjectionSessionOptions, now: number): ProjectionLoopGuardWarning | null {
    const key = projectionLoopGuardKey(options);
    const windowStart = now - LOOP_GUARD_WINDOW_MS;
    while ((this.loopGuardEntries[0]?.at ?? Infinity) < windowStart) {
      this.loopGuardEntries.shift();
    }
    this.loopGuardEntries.push({ key, at: now });
    const repeatedCount = this.loopGuardEntries.filter((entry) => entry.key === key).length;
    if (repeatedCount < LOOP_GUARD_THRESHOLD) return null;
    return {
      reason: options.reason,
      sourceUrl: options.sourceUrl,
      selectedHandleId: options.selectedHandleId ?? null,
      originalSourceUrl: options.originalSourceUrl ?? null,
      repeatedCount,
      threshold: LOOP_GUARD_THRESHOLD,
      windowMs: LOOP_GUARD_WINDOW_MS,
    };
  }
}

function projectionLoopGuardKey(options: BeginProjectionSessionOptions): string {
  return [options.reason, options.sourceUrl, options.selectedHandleId ?? '', options.originalSourceUrl ?? ''].join('\n');
}
