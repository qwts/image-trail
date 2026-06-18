import { applyImageUrl } from '../core/image/image-navigation.js';
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
export type TargetLoadListener = (target: TargetImageInfo) => void;

export class PageAdapter {
  private selected: HTMLImageElement | null = null;
  private hovered: HTMLImageElement | null = null;
  private candidates = new Set<HTMLImageElement>();
  private picking = false;
  private mode: TargetSelectionMode = 'none';
  private lastSnapshot: TargetSelectionSnapshot = this.createSnapshot('No target selected.');
  private readonly observer = new DomObserver(() => this.refreshPickCandidates());
  private readonly listeners = new Set<TargetSelectionListener>();
  private readonly loadListeners = new Set<TargetLoadListener>();
  private pendingLoadTarget: HTMLImageElement | null = null;

  subscribe(listener: TargetSelectionListener): () => void {
    this.listeners.add(listener);
    listener(this.lastSnapshot);
    return () => this.listeners.delete(listener);
  }

  subscribeToSuccessfulLoads(listener: TargetLoadListener): () => void {
    this.loadListeners.add(listener);
    return () => this.loadListeners.delete(listener);
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

  applyUrlToSelected(url: string): TargetSelectionSnapshot {
    if (!this.selected?.isConnected) {
      return this.emit('Select a target image before loading a bookmark.');
    }

    const result = applyImageUrl(this.selected, url);
    this.watchSelectedLoad(this.selected);
    return this.emit(result.message);
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
    const handleId = createTargetImageInfo(image)?.handleId;
    if (handleId) image.setAttribute('data-image-trail-handle', handleId);
    markSelectedTarget(image);
    this.watchSelectedLoad(image);
  }

  private restoreSelectedTarget(): void {
    if (this.selected) {
      this.selected.removeAttribute('data-image-trail-handle');
      restoreElementStyles(this.selected);
    }
    this.clearPendingLoadTarget();
    this.selected = null;
  }

  private watchSelectedLoad(image: HTMLImageElement): void {
    this.clearPendingLoadTarget();
    if (isSuccessfulImageLoad(image)) {
      this.emitSuccessfulLoad(image);
      return;
    }

    this.pendingLoadTarget = image;
    image.addEventListener('load', this.onSelectedLoad, { once: true });
    image.addEventListener('error', this.onSelectedError, { once: true });
  }

  private clearPendingLoadTarget(): void {
    if (!this.pendingLoadTarget) return;
    this.pendingLoadTarget.removeEventListener('load', this.onSelectedLoad);
    this.pendingLoadTarget.removeEventListener('error', this.onSelectedError);
    this.pendingLoadTarget = null;
  }

  private onSelectedLoad = (event: Event): void => {
    const image = event.currentTarget;
    if (image instanceof HTMLImageElement && image === this.selected && isSuccessfulImageLoad(image)) {
      this.emitSuccessfulLoad(image);
    }
    this.clearPendingLoadTarget();
  };

  private onSelectedError = (event: Event): void => {
    if (event.currentTarget === this.pendingLoadTarget) this.clearPendingLoadTarget();
  };

  private emitSuccessfulLoad(image: HTMLImageElement): void {
    const target = createTargetImageInfo(image);
    if (!target) return;
    for (const listener of this.loadListeners) listener(target);
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

function isSuccessfulImageLoad(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}
