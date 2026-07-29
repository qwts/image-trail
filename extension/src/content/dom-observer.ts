export interface DomObserverOptions {
  readonly debounceMs?: number;
  readonly mutationFilter?: ((records: readonly MutationRecord[]) => boolean) | undefined;
  readonly onMutations?: ((records: readonly MutationRecord[]) => void) | undefined;
  readonly observe?: MutationObserverInit | undefined;
  readonly root?: (() => Node | null) | undefined;
}

const DEFAULT_OBSERVE_OPTIONS: MutationObserverInit = { childList: true, subtree: true };

export class DomObserver {
  private observer: MutationObserver | null = null;
  private refreshTimer: number | null = null;
  private refreshQueued = false;
  private refreshGeneration = 0;

  constructor(
    private readonly onRefresh: () => void,
    private readonly options: DomObserverOptions = {},
  ) {}

  start(): void {
    if (this.observer || typeof MutationObserver === 'undefined') return;
    const root = this.options.root?.() ?? document.documentElement;
    if (!root) return;
    this.observer = new MutationObserver((records) => {
      if (this.options.mutationFilter && !this.options.mutationFilter(records)) return;
      this.options.onMutations?.(records);
      this.scheduleRefresh();
    });
    this.observer.observe(root, this.options.observe ?? DEFAULT_OBSERVE_OPTIONS);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.refreshGeneration += 1;
    this.refreshQueued = false;
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private scheduleRefresh(): void {
    const debounceMs = this.options.debounceMs ?? 50;
    if (debounceMs <= 0) {
      if (this.refreshQueued) return;
      this.refreshQueued = true;
      const generation = this.refreshGeneration;
      queueMicrotask(() => {
        if (generation !== this.refreshGeneration) return;
        this.refreshQueued = false;
        this.onRefresh();
      });
      return;
    }
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.onRefresh();
    }, debounceMs);
  }
}
