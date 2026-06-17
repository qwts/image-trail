export class RequestThrottle {
  private lastRunAt = 0;

  constructor(private readonly minimumIntervalMs = 250) {}

  canRun(now = Date.now()): boolean {
    return now - this.lastRunAt >= this.minimumIntervalMs;
  }

  record(now = Date.now()): void {
    this.lastRunAt = now;
  }

  run<T>(operation: () => T, now = Date.now()): T | null {
    if (!this.canRun(now)) return null;
    this.record(now);
    return operation();
  }
}
