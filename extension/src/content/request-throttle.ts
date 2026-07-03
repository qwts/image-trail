export class RequestThrottle {
  private lastRunAt = 0;

  constructor(
    private readonly minimumIntervalMs = 250,
    private readonly now: () => number = Date.now,
  ) {}

  canRun(now = this.now()): boolean {
    return now - this.lastRunAt >= this.minimumIntervalMs;
  }

  record(now = this.now()): void {
    this.lastRunAt = now;
  }

  run<T>(operation: () => T, now = this.now()): T | null {
    if (!this.canRun(now)) return null;
    this.record(now);
    return operation();
  }
}
