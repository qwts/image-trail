import type { RequestGovernorConfig } from '../core/automation/types.js';
import { DEFAULT_GOVERNOR_CONFIG } from '../core/automation/types.js';

export type GovernorStatus = 'ready' | 'throttled' | 'capped';

export class RequestGovernor {
  private timestamps: number[] = [];
  private lastRunAt = 0;
  private config: RequestGovernorConfig;

  constructor(
    config?: Partial<RequestGovernorConfig>,
    private readonly now: () => number = Date.now,
  ) {
    this.config = { ...DEFAULT_GOVERNOR_CONFIG, ...config };
  }

  get status(): GovernorStatus {
    return this.getStatus(this.now());
  }

  canRequest(now = this.now()): boolean {
    return this.getStatus(now) === 'ready';
  }

  record(now = this.now()): void {
    this.lastRunAt = now;
    this.timestamps.push(now);
    this.pruneOldTimestamps(now);
  }

  request<T>(operation: () => T, now = this.now()): { value: T; status: 'ok' } | { value: null; status: GovernorStatus } {
    if (!this.canRequest(now)) {
      return { value: null, status: this.getStatus(now) };
    }
    this.record(now);
    return { value: operation(), status: 'ok' };
  }

  requestsInWindow(now = this.now()): number {
    this.pruneOldTimestamps(now);
    return this.timestamps.length;
  }

  nextReadyDelayMs(now = this.now()): number {
    const status = this.getStatus(now);
    if (status === 'ready') return 0;
    if (status === 'throttled') return Math.max(0, this.config.minimumIntervalMs - (now - this.lastRunAt));
    const oldest = this.timestamps[0];
    return oldest === undefined ? 0 : Math.max(0, oldest + this.config.windowMs - now);
  }

  updateConfig(partial: Partial<RequestGovernorConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  reset(): void {
    this.timestamps.length = 0;
    this.lastRunAt = 0;
  }

  private getStatus(now: number): GovernorStatus {
    if (now - this.lastRunAt < this.config.minimumIntervalMs) return 'throttled';
    this.pruneOldTimestamps(now);
    if (this.timestamps.length >= this.config.maxRequests) return 'capped';
    return 'ready';
  }

  private pruneOldTimestamps(now: number): void {
    const cutoff = now - this.config.windowMs;
    while ((this.timestamps[0] ?? Infinity) < cutoff) {
      this.timestamps.shift();
    }
  }
}
