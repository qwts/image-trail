import {
  applyImageUrl,
  captureImageNavigationSnapshot,
  restoreImageNavigationSnapshot,
  type ImageNavigationSnapshot,
} from '../core/image/image-navigation.js';
import { DomObserver } from './dom-observer.js';
import {
  createLoadedTargetImageInfo,
  createTargetImageInfo,
  findQualifyingImages,
  getImageRejectionReason,
  isQualifyingImage,
  type TargetImageInfo,
} from './target-image.js';
import { markHoveredTarget, markPickModeCandidate, markSelectedTarget, restoreElementStyles } from './page-style.js';
import { createThumbnailDataUrlFromImage } from './thumbnail-generator.js';

export type TargetSelectionMode = 'auto' | 'manual' | 'none';

export interface TargetSelectionSnapshot {
  readonly mode: TargetSelectionMode;
  readonly picking: boolean;
  readonly candidateCount: number;
  readonly selected: TargetImageInfo | null;
  readonly message: string;
}

export type TargetSelectionListener = (snapshot: TargetSelectionSnapshot) => void;
export type TargetLoadListener = (target: TargetImageInfo & { readonly thumbnail?: string; readonly trustedLoadedImage?: boolean }) => void;
export type TargetBookmarkRequestListener = (
  target: TargetImageInfo & { readonly thumbnail?: string; readonly trustedLoadedImage?: boolean },
) => void;

const TARGET_MESSAGE_URL_MAX = 180;

export function summarizeTargetUrlForMessage(url: string | null | undefined): string {
  if (!url) return 'the only qualifying image';
  if (url.startsWith('data:')) return 'data URL';
  if (url.length <= TARGET_MESSAGE_URL_MAX) return url;
  return `${url.slice(0, TARGET_MESSAGE_URL_MAX - 1)}…`;
}

export class PageAdapter {
  private selected: HTMLImageElement | null = null;
  private hovered: HTMLImageElement | null = null;
  private candidates = new Set<HTMLImageElement>();
  private detectedCandidateCount = 0;
  private picking = false;
  private mode: TargetSelectionMode = 'none';
  private lastSnapshot: TargetSelectionSnapshot = this.createSnapshot('No target selected.');
  private readonly observer = new DomObserver(() => this.refreshPickCandidates());
  private readonly listeners = new Set<TargetSelectionListener>();
  private readonly loadListeners = new Set<TargetLoadListener>();
  private readonly bookmarkRequestListeners = new Set<TargetBookmarkRequestListener>();
  private pendingLoadTarget: HTMLImageElement | null = null;
  private selectedOriginalUrl: string | null = null;
  private selectedOriginalSnapshot: ImageNavigationSnapshot | null = null;
  private selectedActiveUrl: string | null = null;
  private bookmarkShortcutActive = false;

  subscribe(listener: TargetSelectionListener): () => void {
    this.listeners.add(listener);
    listener(this.lastSnapshot);
    return () => this.listeners.delete(listener);
  }

  subscribeToSuccessfulLoads(listener: TargetLoadListener): () => void {
    this.loadListeners.add(listener);
    return () => this.loadListeners.delete(listener);
  }

  subscribeToBookmarkRequests(listener: TargetBookmarkRequestListener): () => void {
    this.bookmarkRequestListeners.add(listener);
    return () => this.bookmarkRequestListeners.delete(listener);
  }

  enableBookmarkShortcut(): void {
    if (this.bookmarkShortcutActive) return;
    this.bookmarkShortcutActive = true;
    document.addEventListener('click', this.onBookmarkShortcutClick, true);
  }

  disableBookmarkShortcut(): void {
    if (!this.bookmarkShortcutActive) return;
    this.bookmarkShortcutActive = false;
    document.removeEventListener('click', this.onBookmarkShortcutClick, true);
  }

  autoSelectSingleImage(): TargetSelectionSnapshot {
    const matches = findQualifyingImages();
    this.detectedCandidateCount = matches.length;
    if (matches.length === 1) {
      this.selectTarget(matches[0], 'auto');
      return this.emit(`Auto-selected ${summarizeTargetUrlForMessage(this.lastSnapshot.selected?.url)}.`);
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
      this.unbindCandidateEvents(image);
      if (image !== this.selected) restoreElementStyles(image);
    }
    this.candidates.clear();
    return this.emit(this.selected ? 'Pick mode stopped; selected target is preserved.' : 'Pick mode stopped.');
  }

  cleanup(): void {
    this.disableBookmarkShortcut();
    this.stopPickMode();
    this.restoreSelectedTarget();
    this.mode = 'none';
    this.emit('Target selection cleaned up.');
  }

  getSnapshot(): TargetSelectionSnapshot {
    return this.lastSnapshot;
  }

  applyUrlToSelected(url: string, displayUrl = url): TargetSelectionSnapshot {
    if (!this.selected?.isConnected) {
      return this.emit('Select a target image before loading a bookmark.');
    }

    applyImageUrl(this.selected, displayUrl);
    this.selectedActiveUrl = url;
    this.watchSelectedLoad(this.selected);
    return this.emit(`Applied ${url}`);
  }

  releaseSelectedTarget(): TargetSelectionSnapshot {
    if (!this.selected) return this.emit('No host image selected.');
    this.restoreSelectedTarget();
    this.mode = 'none';
    return this.emit('Released host image and restored its original URL.');
  }

  private refreshPickCandidates(): TargetSelectionSnapshot {
    if (!this.picking) return this.lastSnapshot;
    const nextCandidates = new Set(findQualifyingImages());
    this.detectedCandidateCount = nextCandidates.size;

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
    this.unbindCandidateEvents(image);
    restoreElementStyles(image);
  }

  private unbindCandidateEvents(image: HTMLImageElement): void {
    image.removeEventListener('mouseenter', this.onMouseEnter, true);
    image.removeEventListener('mouseleave', this.onMouseLeave, true);
    image.removeEventListener('click', this.onClick, true);
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

  private onBookmarkShortcutClick = (event: MouseEvent): void => {
    if (!event.shiftKey || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const image = findImageFromShortcutTarget(target);
    if (!(image instanceof HTMLImageElement)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!isQualifyingImage(image)) {
      this.emit(`Could not bookmark image: ${getImageRejectionReason(image) ?? 'Image is not usable.'}`);
      return;
    }
    const info = createLoadedTargetImageInfo(image) ?? createTargetImageInfo(image);
    if (!info) {
      this.emit('Could not bookmark image: Image source could not be resolved.');
      return;
    }

    void this.emitBookmarkRequest(image, info);
  };

  private async emitBookmarkRequest(image: HTMLImageElement, info: TargetImageInfo): Promise<void> {
    const thumbnail = (await createThumbnailDataUrlFromImage(image)) ?? undefined;
    for (const listener of this.bookmarkRequestListeners) listener({ ...info, thumbnail, trustedLoadedImage: true });
  }

  private selectTarget(image: HTMLImageElement, mode: TargetSelectionMode): void {
    const originalUrl = createTargetImageInfo(image)?.url ?? null;
    const originalSnapshot = captureImageNavigationSnapshot(image);
    this.restoreSelectedTarget();
    this.selected = image;
    this.selectedOriginalUrl = originalUrl;
    this.selectedOriginalSnapshot = originalSnapshot;
    this.selectedActiveUrl = originalUrl;
    this.mode = mode;
    const handleId = createTargetImageInfo(image)?.handleId;
    if (handleId) image.setAttribute('data-image-trail-handle', handleId);
    markSelectedTarget(image);
    this.watchSelectedLoad(image);
  }

  private restoreSelectedTarget(): void {
    if (this.selected) {
      if (this.selectedOriginalSnapshot) {
        restoreImageNavigationSnapshot(this.selectedOriginalSnapshot);
      } else if (this.selectedOriginalUrl && createTargetImageInfo(this.selected)?.url !== this.selectedOriginalUrl) {
        applyImageUrl(this.selected, this.selectedOriginalUrl);
      }
      this.selected.removeAttribute('data-image-trail-handle');
      restoreElementStyles(this.selected);
    }
    this.clearPendingLoadTarget();
    this.selected = null;
    this.selectedOriginalUrl = null;
    this.selectedOriginalSnapshot = null;
    this.selectedActiveUrl = null;
  }

  private watchSelectedLoad(image: HTMLImageElement): void {
    this.clearPendingLoadTarget();
    if (isSuccessfulImageLoad(image)) {
      void this.emitSuccessfulLoad(image);
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
      void this.emitSuccessfulLoad(image);
    }
    this.clearPendingLoadTarget();
  };

  private onSelectedError = (event: Event): void => {
    if (event.currentTarget === this.pendingLoadTarget) this.clearPendingLoadTarget();
  };

  private async emitSuccessfulLoad(image: HTMLImageElement): Promise<void> {
    const target = createTargetImageInfo(image);
    if (!target) return;
    const reportedTarget = image === this.selected && this.selectedActiveUrl ? { ...target, url: this.selectedActiveUrl } : target;
    if (image === this.selected) {
      this.selectedActiveUrl = reportedTarget.url;
      this.emit(reportedTarget.url.startsWith('data:') ? 'Loaded data URL' : `Loaded ${reportedTarget.url}`);
    }
    const thumbnail = (await createThumbnailDataUrlFromImage(image)) ?? undefined;
    for (const listener of this.loadListeners) listener({ ...reportedTarget, thumbnail, trustedLoadedImage: true });
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
    const selected = this.selected?.isConnected ? createTargetImageInfo(this.selected) : null;
    return {
      mode: this.mode,
      picking: this.picking,
      candidateCount: this.picking ? this.candidates.size : this.detectedCandidateCount,
      selected: selected && this.selectedActiveUrl ? { ...selected, url: this.selectedActiveUrl } : selected,
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

function findImageFromShortcutTarget(target: Element): HTMLImageElement | null {
  const direct = target.closest('img');
  if (direct instanceof HTMLImageElement) return direct;

  const linked = target.closest('a,[role="link"]')?.querySelector('img');
  if (linked instanceof HTMLImageElement) return linked;

  const nested = target.querySelector('img');
  if (nested instanceof HTMLImageElement) return nested;

  const interactive = target.closest('[role="button"],article,[data-testid]');
  const nestedInteractive = interactive?.querySelector('img');
  return nestedInteractive instanceof HTMLImageElement ? nestedInteractive : null;
}
