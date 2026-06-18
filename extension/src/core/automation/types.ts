export type AutomationPhase = 'idle' | 'running' | 'paused' | 'stopped' | 'error' | 'exhausted';

export interface AutomationStatus {
  readonly phase: AutomationPhase;
  readonly message: string;
  readonly retriesUsed?: number;
  readonly retriesMax?: number;
  readonly slidesShown?: number;
}

export interface SlideshowConfig {
  readonly intervalMs: number;
  readonly direction: 1 | -1;
}

export interface RetryConfig {
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly advanceOnExhaust: boolean;
}

export interface RequestGovernorConfig {
  readonly minimumIntervalMs: number;
  readonly maxRequestsPerMinute: number;
}

export const DEFAULT_SLIDESHOW_CONFIG: SlideshowConfig = {
  intervalMs: 2000,
  direction: 1,
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  advanceOnExhaust: true,
};

export const DEFAULT_GOVERNOR_CONFIG: RequestGovernorConfig = {
  minimumIntervalMs: 250,
  maxRequestsPerMinute: 60,
};

export type AutomationCommand = 'start' | 'stop' | 'pause' | 'resume';
