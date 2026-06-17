export class DomObserver {
  private observer: MutationObserver | null = null;
  private refreshTimer: number | null = null;

  constructor(private readonly onRefresh: () => void) {}

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scheduleRefresh());
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.onRefresh();
    }, 50);
  }
}
