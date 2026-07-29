import { DomObserver } from './dom-observer.js';
import { recoverTargetImage, type TargetImageLocator } from './target-image.js';

export const TARGET_RECOVERY_FAILED_BATCH_LIMIT = 12;

interface RefreshObserver {
  start(): void;
  stop(): void;
}

export interface TargetRecoveryControllerDeps {
  readonly shouldRecover: () => boolean;
  readonly onRecovered: (replacement: HTMLImageElement) => void;
  readonly recover?: ((locator: TargetImageLocator) => HTMLImageElement | null) | undefined;
  readonly createObserver?: ((onRefresh: () => void) => RefreshObserver) | undefined;
  readonly failedBatchLimit?: number | undefined;
}

export class TargetRecoveryController {
  private readonly observer: RefreshObserver;
  private readonly recover: (locator: TargetImageLocator) => HTMLImageElement | null;
  private readonly failedBatchLimit: number;
  private locator: TargetImageLocator | null = null;
  private failedBatches = 0;

  constructor(private readonly deps: TargetRecoveryControllerDeps) {
    this.observer = (
      deps.createObserver ??
      ((onRefresh) =>
        new DomObserver(onRefresh, {
          debounceMs: 0,
          mutationFilter: targetRecoveryMutationAffectsRecovery,
        }))
    )(() => this.refresh());
    this.recover = deps.recover ?? ((locator) => recoverTargetImage(locator));
    this.failedBatchLimit = Math.max(1, deps.failedBatchLimit ?? TARGET_RECOVERY_FAILED_BATCH_LIMIT);
  }

  start(locator: TargetImageLocator | null): void {
    this.stop();
    if (!locator) return;
    this.locator = locator;
    this.observer.start();
  }

  stop(): void {
    this.observer.stop();
    this.locator = null;
    this.failedBatches = 0;
  }

  private refresh(): void {
    if (!this.locator || !this.deps.shouldRecover()) return;
    const replacement = this.recover(this.locator);
    if (replacement) {
      this.failedBatches = 0;
      this.deps.onRecovered(replacement);
      return;
    }
    this.failedBatches += 1;
    if (this.failedBatches >= this.failedBatchLimit) this.observer.stop();
  }
}

export function targetRecoveryMutationAffectsRecovery(records: readonly MutationRecord[]): boolean {
  return records.some((record) =>
    [...record.addedNodes, ...record.removedNodes].some(
      (node) => node instanceof HTMLImageElement || (node instanceof Element && node.querySelector('img') !== null),
    ),
  );
}
