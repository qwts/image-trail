import type { AutomationPhase, RetryConfig } from './types.js';
import { DEFAULT_RETRY_CONFIG } from './types.js';

export type RetryLoadFn = () => Promise<boolean>;
export type RetryAdvanceFn = (direction: 1 | -1) => void;

export class Retry404 {
  private phase: AutomationPhase = 'idle';
  private attempt = 0;
  private runId = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private config: RetryConfig;

  constructor(
    private readonly loadFn: RetryLoadFn,
    private readonly advanceFn: RetryAdvanceFn,
    private readonly onPhaseChange: (phase: AutomationPhase, attempt: number, max: number) => void,
    config?: Partial<RetryConfig>,
  ) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  get currentPhase(): AutomationPhase {
    return this.phase;
  }

  get retriesUsed(): number {
    return this.attempt;
  }

  get retriesMax(): number {
    return this.config.maxRetries;
  }

  start(): void {
    if (this.phase === 'running') return;
    this.attempt = 0;
    this.runId++;
    this.setPhase('running');
    void this.tryOnce(this.runId);
  }

  stop(): void {
    this.runId++;
    this.cancelTimer();
    this.setPhase('stopped');
  }

  reset(): void {
    this.cancelTimer();
    this.attempt = 0;
    this.setPhase('idle');
  }

  destroy(): void {
    this.cancelTimer();
    this.phase = 'idle';
    this.attempt = 0;
  }

  private async tryOnce(expectedRunId: number): Promise<void> {
    if (this.phase !== 'running' || this.runId !== expectedRunId) return;

    this.attempt++;
    this.onPhaseChange(this.phase, this.attempt, this.config.maxRetries);

    try {
      const success = await this.loadFn();
      if (this.runId !== expectedRunId) return;
      if (success) {
        this.setPhase('idle');
        return;
      }
    } catch {
      if (this.runId !== expectedRunId) return;
    }

    if (this.phase !== 'running' || this.runId !== expectedRunId) return;

    if (this.attempt >= this.config.maxRetries) {
      if (this.config.advanceOnExhaust) {
        this.advanceFn(1);
        this.setPhase('exhausted');
      } else {
        this.setPhase('exhausted');
      }
      return;
    }

    this.timerId = setTimeout(() => {
      void this.tryOnce(expectedRunId);
    }, this.config.retryDelayMs);
  }

  private cancelTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private setPhase(phase: AutomationPhase): void {
    this.phase = phase;
    this.onPhaseChange(phase, this.attempt, this.config.maxRetries);
  }
}
