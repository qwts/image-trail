import type { AutomationPhase, SlideshowConfig } from './types.js';
import { DEFAULT_SLIDESHOW_CONFIG } from './types.js';

export type SlideshowStepFn = (direction: 1 | -1) => void;

export class Slideshow {
  private phase: AutomationPhase = 'idle';
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private config: SlideshowConfig;
  private count = 0;

  constructor(
    private readonly step: SlideshowStepFn,
    private readonly onPhaseChange: (phase: AutomationPhase, count: number) => void,
    config?: Partial<SlideshowConfig>,
  ) {
    this.config = { ...DEFAULT_SLIDESHOW_CONFIG, ...config };
  }

  get currentPhase(): AutomationPhase {
    return this.phase;
  }

  get slidesShown(): number {
    return this.count;
  }

  start(config?: Partial<SlideshowConfig>): void {
    if (this.phase === 'running') return;
    if (config) this.config = { ...this.config, ...config };
    this.count = 0;
    this.setPhase('running');
    this.scheduleNext();
  }

  stop(): void {
    this.cancelTimer();
    this.setPhase('stopped');
  }

  pause(): void {
    if (this.phase !== 'running') return;
    this.cancelTimer();
    this.setPhase('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.setPhase('running');
    this.scheduleNext();
  }

  setDirection(direction: 1 | -1): void {
    this.config = { ...this.config, direction };
  }

  destroy(): void {
    this.cancelTimer();
    this.phase = 'idle';
    this.count = 0;
  }

  private scheduleNext(): void {
    this.cancelTimer();
    if (this.phase !== 'running') return;
    this.timerId = setTimeout(() => {
      if (this.phase !== 'running') return;
      this.count++;
      this.step(this.config.direction);
      this.onPhaseChange(this.phase, this.count);
      this.scheduleNext();
    }, this.config.intervalMs);
  }

  private cancelTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private setPhase(phase: AutomationPhase): void {
    this.phase = phase;
    this.onPhaseChange(phase, this.count);
  }
}
