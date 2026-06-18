import type { RequestGovernorConfig } from '../core/automation/types.js';
import { DEFAULT_GOVERNOR_CONFIG } from '../core/automation/types.js';

export type GovernorStatus = 'ready' | 'throttled' | 'capped';

export class RequestGovernor {
  private timestamps: number[] = [];
  private lastRunAt = 0;
  private config: RequestGovernorConfig;

  constructor(config?: Partial<RequestGovernorConfig>) {
    this.config = { ...DEFAULT_GOVERNOR_CONFIG, ...config };
  }

  get status(): GovernorStatus {
    return this.getStatus(Date.now());
  }

  canRequest(now = Date.now()): boolean {
    return this.getStatus(now) === 'ready';
  }

  record(now = Date.now()): void {
    this.lastRunAt = now;
    this.timestamps.push(now);
    this.pruneOldTimestamps(now);
  }

  request<T>(operation: () => T, now = Date.now()): { value: T; status: 'ok' } | { value: null; status: GovernorStatus } {
    if (!this.canRequest(now)) {
      return { value: null, status: this.getStatus(now) };
    }
    this.record(now);
    return { value: operation(), status: 'ok' };
  }

  requestsInLastMinute(now = Date.now()): number {
    this.pruneOldTimestamps(now);
    return this.timestamps.length;
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
    if (this.timestamps.length >= this.config.maxRequestsPerMinute) return 'capped';
    return 'ready';
  }

  private pruneOldTimestamps(now: number): void {
    const cutoff = now - 60_000;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
  }
}
