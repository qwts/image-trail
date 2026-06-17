import { DomObserver } from './dom-observer.js';
import { createTargetImageInfo, findQualifyingImages, type TargetImageInfo } from './target-image.js';
import { markHoveredTarget, markPickModeCandidate, markSelectedTarget, restoreElementStyles } from './page-style.js';

export type TargetSelectionMode = 'auto' | 'manual' | 'none';

export interface TargetSelectionSnapshot {
  readonly mode: TargetSelectionMode;
  readonly picking: boolean;
  readonly candidateCount: number;
  readonly selected: TargetImageInfo | null;
  readonly message: string;
}

export type TargetSelectionListener = (snapshot: TargetSelectionSnapshot) => void;

export class PageAdapter {
  private selected: HTMLImageElement | null = null;
  private hovered: HTMLImageElement | null = null;
  private candidates = new Set<HTMLImageElement>();
  private picking = false;
  private mode: TargetSelectionMode = 'none';
  private lastSnapshot: TargetSelectionSnapshot = this.createSnapshot('No target selected.');
  private readonly observer = new DomObserver(() => this.refreshPickCandidates());
  private readonly listeners = new Set<TargetSelectionListener>();

  subscribe(listener: TargetSelectionListener): () => void {
    this.listeners.add(listener);
    listener(this.lastSnapshot);
    return () => this.listeners.delete(listener);
  }

  autoSelectSingleImage(): TargetSelectionSnapshot {
    const matches = findQualifyingImages();
    if (matches.length === 1) {
      this.selectTarget(matches[0], 'auto');
      return this.emit(`Auto-selected ${this.lastSnapshot.selected?.url ?? 'the only qualifying image'}.`);
    }

    this.mode = 'none';
    return this.emit(
      matches.length === 0
        ? 'No qualifying images found. Use pick mode after images load.'
        : `${matches.length} qualifying images found. Pick one target image.`,
    );
  }

  startPickMode(): TargetSelectionSnapshot {
    this.picking = true;
    this.mode = 'manual';
    this.observer.start();
    return this.refreshPickCandidates();
  }

  stopPickMode(): TargetSelectionSnapshot {
    this.picking = false;
    this.observer.stop();
    this.clearHover();
    for (const image of this.candidates) {
      if (image !== this.selected) restoreElementStyles(image);
    }
    this.candidates.clear();
    return this.emit(this.selected ? 'Pick mode stopped; selected target is preserved.' : 'Pick mode stopped.');
  }

  cleanup(): void {
    this.stopPickMode();
    this.restoreSelectedTarget();
    this.mode = 'none';
    this.emit('Target selection cleaned up.');
  }

  getSnapshot(): TargetSelectionSnapshot {
    return this.lastSnapshot;
  }

  private refreshPickCandidates(): TargetSelectionSnapshot {
    if (!this.picking) return this.lastSnapshot;
    const nextCandidates = new Set(findQualifyingImages());

    for (const oldCandidate of this.candidates) {
      if (!nextCandidates.has(oldCandidate) && oldCandidate !== this.selected) {
        this.unbindCandidate(oldCandidate);
      }
    }

    for (const candidate of nextCandidates) {
      if (!this.candidates.has(candidate)) this.bindCandidate(candidate);
    }

    this.candidates = nextCandidates;
    return this.emit(`Pick mode is active. ${this.candidates.size} image candidate${this.candidates.size === 1 ? '' : 's'} available.`);
  }

  private bindCandidate(image: HTMLImageElement): void {
    markPickModeCandidate(image);
    image.addEventListener('mouseenter', this.onMouseEnter, true);
    image.addEventListener('mouseleave', this.onMouseLeave, true);
    image.addEventListener('click', this.onClick, true);
  }

  private unbindCandidate(image: HTMLImageElement): void {
    image.removeEventListener('mouseenter', this.onMouseEnter, true);
    image.removeEventListener('mouseleave', this.onMouseLeave, true);
    image.removeEventListener('click', this.onClick, true);
    restoreElementStyles(image);
  }

  private onMouseEnter = (event: MouseEvent): void => {
    const image = event.currentTarget;
    if (image instanceof HTMLImageElement) {
      this.clearHover();
      this.hovered = image;
      markHoveredTarget(image);
    }
  };

  private onMouseLeave = (event: MouseEvent): void => {
    if (event.currentTarget === this.hovered) this.clearHover();
  };

  private onClick = (event: MouseEvent): void => {
    const image = event.currentTarget;
    if (!(image instanceof HTMLImageElement) || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.selectTarget(image, 'manual');
    this.stopPickMode();
    this.emit(`Selected ${this.lastSnapshot.selected?.url ?? 'image target'}.`);
  };

  private selectTarget(image: HTMLImageElement, mode: TargetSelectionMode): void {
    this.restoreSelectedTarget();
    this.selected = image;
    this.mode = mode;
    markSelectedTarget(image);
  }

  private restoreSelectedTarget(): void {
    if (this.selected) restoreElementStyles(this.selected);
    this.selected = null;
  }

  private clearHover(): void {
    if (this.hovered && this.hovered !== this.selected) {
      const candidate = this.hovered;
      restoreElementStyles(candidate);
      if (this.picking && this.candidates.has(candidate)) markPickModeCandidate(candidate);
    }
    this.hovered = null;
  }

  private createSnapshot(message: string): TargetSelectionSnapshot {
    return {
      mode: this.mode,
      picking: this.picking,
      candidateCount: this.candidates.size,
      selected: this.selected?.isConnected ? createTargetImageInfo(this.selected) : null,
      message,
    };
  }

  private emit(message: string): TargetSelectionSnapshot {
    this.lastSnapshot = this.createSnapshot(message);
    for (const listener of this.listeners) listener(this.lastSnapshot);
    return this.lastSnapshot;
  }
}
