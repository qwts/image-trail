import type { AutomationPhase } from './types.js';

export interface QueuedNavigation {
  readonly url: string;
  readonly source: 'manual' | 'slideshow' | 'retry' | 'preload';
}

export type NavigationExecutor = (entry: QueuedNavigation) => Promise<boolean>;

export class NavigationQueue {
  private queue: QueuedNavigation[] = [];
  private phase: AutomationPhase = 'idle';
  private processing = false;

  constructor(
    private readonly executor: NavigationExecutor,
    private readonly onPhaseChange: (phase: AutomationPhase, message: string) => void,
  ) {}

  get currentPhase(): AutomationPhase {
    return this.phase;
  }

  get length(): number {
    return this.queue.length;
  }

  enqueue(entry: QueuedNavigation): boolean {
    if (this.phase === 'stopped' || this.phase === 'error') return false;
    this.queue.push(entry);
    if (!this.processing) void this.processNext();
    return true;
  }

  stop(): void {
    this.setPhase('stopped', 'Navigation stopped.');
    this.queue.length = 0;
    this.processing = false;
  }

  pause(): void {
    if (this.phase === 'running') {
      this.setPhase('paused', 'Navigation paused.');
    }
  }

  resume(): void {
    if (this.phase === 'paused') {
      this.setPhase('running', 'Navigation resumed.');
      if (!this.processing) void this.processNext();
    }
  }

  reset(): void {
    this.queue.length = 0;
    this.processing = false;
    this.setPhase('idle', 'Queue cleared.');
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    if (this.phase === 'stopped' || this.phase === 'paused' || this.phase === 'error') return;

    const entry = this.queue.shift();
    if (!entry) {
      if (this.phase === 'running') this.setPhase('idle', 'Queue empty.');
      return;
    }

    this.processing = true;
    this.setPhase('running', `Loading ${entry.url}`);

    try {
      const success = await this.executor(entry);
      this.processing = false;
      if (!success && this.phase === 'running') {
        this.setPhase('error', `Failed to load ${entry.url}`);
        return;
      }
    } catch {
      this.processing = false;
      this.setPhase('error', 'Navigation error.');
      return;
    }

    if (this.phase === 'running') void this.processNext();
  }

  private setPhase(phase: AutomationPhase, message: string): void {
    this.phase = phase;
    this.onPhaseChange(phase, message);
  }
}
