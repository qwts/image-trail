import {
  DEFAULT_LINKED_PAGE_IMAGE_GRAB_STRATEGY,
  normalizeGrabStrategy,
  type LinkedPageImageGrabStrategy,
  type UrlTemplateGrabStrategy,
} from '../core/url/grab-strategies.js';
import { findBestMatchingGrabSourcePattern, type GrabSourcePattern, type UrlTemplateRecord } from '../core/url/templates.js';
import { parseUrl } from '../core/url/parse-url.js';
import {
  applyImageUrl,
  captureImageNavigationSnapshot,
  imageResourceUrlsEqual,
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
import {
  markGrabPreviewTarget,
  markHoveredTarget,
  markPickModeCandidate,
  markSelectedTarget,
  keepSelectedTargetBackdropBlack,
  restoreElementStyles,
  restoreGrabPreviewTarget,
  snapshotElementStyles,
} from './page-style.js';
import { createThumbnailDataUrlFromImage } from './thumbnail-generator.js';
import { createFetchLinkedPageMessage, isFetchLinkedPageResultMessage } from '../background/messages.js';
import { sendRuntimeMessage } from './runtime-message.js';
import { DEFAULT_PREVIEW_OBJECT_FIT, type ObjectFitMode } from '../core/preview-style.js';
import type { ProjectionReason } from '../core/projection-session.js';

export type TargetSelectionMode = 'auto' | 'manual' | 'none';

export interface TargetSelectionSnapshot {
  readonly mode: TargetSelectionMode;
  readonly picking: boolean;
  readonly grabModeActive: boolean;
  readonly candidateCount: number;
  readonly selected: TargetImageInfo | null;
  readonly fillScreen: boolean;
  readonly objectFit: ObjectFitMode;
  readonly message: string;
}

export type TargetSelectionListener = (snapshot: TargetSelectionSnapshot) => void;
export type TargetLoadListener = (
  target: TargetImageInfo & {
    readonly thumbnail?: string;
    readonly trustedLoadedImage?: boolean;
    readonly projectionId?: string;
    readonly projectionReason?: ProjectionReason;
  },
) => void;
export type TargetBookmarkRequestListener = (
  target: Omit<TargetImageInfo, 'width' | 'height'> & {
    readonly width?: number;
    readonly height?: number;
    readonly thumbnail?: string;
    readonly trustedLoadedImage?: boolean;
  },
) => void;
export type TargetGrabSourcePatternRequestListener = (url: string) => void;

type GrabStrategyId = 'clicked-image' | 'linked-page-image';

interface GrabStrategy {
  readonly id: GrabStrategyId;
  readonly label: string;
  execute(target: Element): Promise<boolean>;
}

interface GrabPreviewResolution {
  readonly state: 'valid' | 'invalid';
  readonly element: HTMLElement;
  readonly strategy: GrabStrategy;
  readonly reason?: string;
}

const TARGET_MESSAGE_URL_MAX = 180;

export function summarizeTargetUrlForMessage(url: string | null | undefined): string {
  if (!url) return 'the only qualifying image';
  if (url.startsWith('data:')) return 'data URL';
  if (url.length <= TARGET_MESSAGE_URL_MAX) return url;
  return `${url.slice(0, TARGET_MESSAGE_URL_MAX - 1)}…`;
}

export function isEventFromImageTrailPanel(event: Event): boolean {
  const composedPath = event.composedPath?.() ?? [];
  if (composedPath.some(isImageTrailPanelHost)) return true;
  const composedTarget = composedPath[0] ?? event.target;
  return closestImageTrailPanelRoot(composedTarget);
}

function isImageTrailPanelHost(node: unknown): boolean {
  return !!node && typeof node === 'object' && (node as { id?: unknown }).id === 'image-trail-panel-root';
}

function closestImageTrailPanelRoot(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const closest = (node as { closest?: unknown }).closest;
  return typeof closest === 'function' && closest.call(node, '#image-trail-panel-root') !== null;
}

function isBodyOnlyImageDocument(image: HTMLImageElement | undefined): boolean {
  const body = document.body;
  return !!image && !!body && body.childElementCount === 1 && body.firstElementChild === image;
}

export class PageAdapter {
  private selected: HTMLImageElement | null = null;
  private hovered: HTMLImageElement | null = null;
  private candidates = new Set<HTMLImageElement>();
  private detectedCandidateCount = 0;
  private picking = false;
  private mode: TargetSelectionMode = 'none';
  private pendingLoadTarget: HTMLImageElement | null = null;
  private pendingLoadActiveUrl: string | null = null;
  private pendingLoadDisplayUrl: string | null = null;
  private pendingLoadProjectionId: string | null = null;
  private pendingLoadProjectionReason: ProjectionReason | null = null;
  private selectedOriginalUrl: string | null = null;
  private selectedOriginalSnapshot: ImageNavigationSnapshot | null = null;
  private selectedActiveUrl: string | null = null;
  private selectedDisplayUrl: string | null = null;
  private selectedProjectionId: string | null = null;
  private selectedProjectionReason: ProjectionReason | null = null;
  private selectedFillScreen = true;
  private selectedObjectFit: ObjectFitMode = DEFAULT_PREVIEW_OBJECT_FIT;
  private lastSnapshot: TargetSelectionSnapshot = this.createSnapshot('No target selected.');
  private readonly observer = new DomObserver(() => this.refreshPickCandidates());
  private readonly listeners = new Set<TargetSelectionListener>();
  private readonly loadListeners = new Set<TargetLoadListener>();
  private readonly bookmarkRequestListeners = new Set<TargetBookmarkRequestListener>();
  private readonly grabSourcePatternRequestListeners = new Set<TargetGrabSourcePatternRequestListener>();
  private bookmarkShortcutActive = false;
  private grabModeActive = false;
  private grabSourcePatterns: readonly GrabSourcePattern[] = [];
  private activeTemplateGrabStrategy: UrlTemplateGrabStrategy | undefined;
  private suppressBookmarkShortcutClickTarget: EventTarget | null = null;
  private grabPreview: { readonly element: HTMLElement; readonly state: 'valid' | 'invalid' } | null = null;
  private preparedStandaloneBackdrop: HTMLImageElement | null = null;
  private readonly grabStrategies: readonly GrabStrategy[] = [
    {
      id: 'linked-page-image',
      label: 'Linked page image',
      execute: (target) => this.grabLinkedPageImage(target),
    },
    {
      id: 'clicked-image',
      label: 'Clicked image',
      execute: (target) => this.grabClickedImage(target),
    },
  ];

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

  subscribeToGrabSourcePatternRequests(listener: TargetGrabSourcePatternRequestListener): () => void {
    this.grabSourcePatternRequestListeners.add(listener);
    return () => this.grabSourcePatternRequestListeners.delete(listener);
  }

  prepareStandaloneImageBackdrop(options: { readonly requireBodyOnlyImage?: boolean } = {}): void {
    const images = Array.from(document.images);
    const onlyImage = images.length === 1 ? images[0] : undefined;
    if (options.requireBodyOnlyImage && !isBodyOnlyImageDocument(images[0])) return;
    if (onlyImage) {
      snapshotElementStyles(onlyImage);
      keepSelectedTargetBackdropBlack(onlyImage);
      this.preparedStandaloneBackdrop = onlyImage;
    }
  }

  enableBookmarkShortcut(): void {
    if (this.bookmarkShortcutActive) return;
    this.bookmarkShortcutActive = true;
    document.addEventListener('pointerdown', this.onBookmarkShortcutPointerDown, true);
    document.addEventListener('pointermove', this.onGrabPreviewPointerMove, true);
    document.addEventListener('pointerout', this.onGrabPreviewPointerOut, true);
    document.addEventListener('click', this.onBookmarkShortcutClick, true);
  }

  disableBookmarkShortcut(): void {
    if (!this.bookmarkShortcutActive) return;
    this.bookmarkShortcutActive = false;
    document.removeEventListener('pointerdown', this.onBookmarkShortcutPointerDown, true);
    document.removeEventListener('pointermove', this.onGrabPreviewPointerMove, true);
    document.removeEventListener('pointerout', this.onGrabPreviewPointerOut, true);
    document.removeEventListener('click', this.onBookmarkShortcutClick, true);
    this.clearGrabPreview();
  }

  autoSelectSingleImage(): TargetSelectionSnapshot {
    const matches = findQualifyingImages();
    this.detectedCandidateCount = matches.length;
    if (this.selected?.isConnected && matches.includes(this.selected)) {
      markSelectedTarget(this.selected, { lockBox: this.selectedFillScreen, objectFit: this.selectedObjectFit });
      if (matches.length !== 1) return this.emit(`Selected ${summarizeTargetUrlForMessage(this.lastSnapshot.selected?.url)}.`);
    }
    const onlyMatch = matches.length === 1 ? matches[0] : undefined;
    if (onlyMatch) {
      if (onlyMatch === this.selected && this.selected.isConnected) {
        return this.emit(`Auto-selected ${summarizeTargetUrlForMessage(this.lastSnapshot.selected?.url)}.`);
      }
      this.selectTarget(onlyMatch, 'auto');
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
    if (this.grabModeActive) this.stopGrabMode();
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

  startGrabMode(): TargetSelectionSnapshot {
    if (this.picking) this.stopPickMode();
    this.grabModeActive = true;
    return this.emit('Grab Mode is active. Click page images to add them to the queue.');
  }

  stopGrabMode(): TargetSelectionSnapshot {
    if (!this.grabModeActive) return this.lastSnapshot;
    this.grabModeActive = false;
    this.clearGrabPreview();
    return this.emit('Grab Mode stopped.');
  }

  setUrlTemplates(templates: readonly UrlTemplateRecord[], activeTemplateId: string | null): void {
    const template = templates.find((candidate) => candidate.id === activeTemplateId) ?? null;
    this.activeTemplateGrabStrategy = normalizeGrabStrategy(template?.grabStrategy);
  }

  setGrabSourcePatterns(patterns: readonly GrabSourcePattern[]): void {
    this.grabSourcePatterns = patterns;
  }

  cleanup(): void {
    this.disableBookmarkShortcut();
    this.grabModeActive = false;
    this.clearGrabPreview();
    this.stopPickMode();
    this.restorePreparedStandaloneBackdrop();
    this.restoreSelectedTarget();
    this.emit('Target selection cleaned up.');
  }

  suspend(): void {
    this.disableBookmarkShortcut();
    this.grabModeActive = false;
    this.clearGrabPreview();
    this.stopPickMode();
    this.restoreSelectedTargetStyles();
    this.mode = 'none';
  }

  getSnapshot(): TargetSelectionSnapshot {
    return this.lastSnapshot;
  }

  applyUrlToSelected(
    url: string,
    displayUrl = url,
    options: { readonly projectionId?: string; readonly projectionReason?: ProjectionReason } = {},
  ): TargetSelectionSnapshot {
    if (!this.selected?.isConnected) {
      return this.emit('Select a target image before loading a bookmark.');
    }

    markSelectedTarget(this.selected, { lockBox: this.selectedFillScreen, objectFit: this.selectedObjectFit });
    applyImageUrl(this.selected, displayUrl);
    this.selectedActiveUrl = url;
    this.selectedDisplayUrl = displayUrl;
    this.selectedProjectionId = options.projectionId ?? null;
    this.selectedProjectionReason = options.projectionReason ?? null;
    this.watchSelectedLoad(this.selected);
    return this.emit(`Applied ${url}`);
  }

  setPreviewPreferences(preferences: { readonly fillScreen: boolean; readonly objectFit: ObjectFitMode }): TargetSelectionSnapshot {
    this.selectedFillScreen = preferences.fillScreen;
    this.selectedObjectFit = preferences.objectFit;
    if (this.selected) {
      markSelectedTarget(this.selected, { lockBox: this.selectedFillScreen, objectFit: this.selectedObjectFit });
    }
    this.lastSnapshot = this.createSnapshot(this.lastSnapshot.message);
    return this.lastSnapshot;
  }

  setSelectedFillScreen(enabled: boolean): TargetSelectionSnapshot {
    if (!this.selected) return this.emit('No host image selected.');
    this.selectedFillScreen = enabled;
    markSelectedTarget(this.selected, { lockBox: this.selectedFillScreen, objectFit: this.selectedObjectFit });
    return this.emit(enabled ? 'Host image fills the page.' : 'Host image restored to page layout.');
  }

  setSelectedObjectFit(mode: ObjectFitMode): TargetSelectionSnapshot {
    this.selectedObjectFit = mode;
    if (this.selected) {
      markSelectedTarget(this.selected, { lockBox: this.selectedFillScreen, objectFit: this.selectedObjectFit });
    }
    return this.emit(`Host image fit set to ${mode}.`);
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

  private onBookmarkShortcutPointerDown = (event: PointerEvent): void => {
    if (this.handleGrabSourcePatternRequestEvent(event)) {
      this.suppressBookmarkShortcutClickTarget = event.target;
      window.setTimeout(() => {
        if (this.suppressBookmarkShortcutClickTarget === event.target) this.suppressBookmarkShortcutClickTarget = null;
      }, 700);
      return;
    }
    if (this.handleBookmarkShortcutEvent(event)) {
      this.suppressBookmarkShortcutClickTarget = event.target;
      window.setTimeout(() => {
        if (this.suppressBookmarkShortcutClickTarget === event.target) this.suppressBookmarkShortcutClickTarget = null;
      }, 700);
    }
  };

  private onBookmarkShortcutClick = (event: MouseEvent): void => {
    if (this.suppressBookmarkShortcutClickTarget === event.target) {
      this.suppressBookmarkShortcutClickTarget = null;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    this.handleBookmarkShortcutEvent(event);
  };

  private onGrabPreviewPointerMove = (event: PointerEvent): void => {
    if (!this.grabModeActive) {
      this.clearGrabPreview();
      return;
    }
    const target = event.target;
    if (!(target instanceof Element) || isEventFromImageTrailPanel(event)) {
      this.clearGrabPreview();
      return;
    }
    this.applyGrabPreview(this.resolveGrabPreview(target));
  };

  private onGrabPreviewPointerOut = (event: PointerEvent): void => {
    if (!event.relatedTarget) this.clearGrabPreview();
  };

  private handleBookmarkShortcutEvent(event: MouseEvent): boolean {
    if ((!event.shiftKey && !this.grabModeActive) || event.button !== 0) return false;
    if (isEventFromImageTrailPanel(event)) {
      this.clearGrabPreview();
      return false;
    }
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const preview = this.resolveGrabPreview(target);
    if (preview.state === 'invalid' && !this.grabModeActive) return false;
    this.applyGrabPreview(preview);

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (preview.state === 'invalid') {
      this.emit(`Could not grab target: ${preview.reason ?? 'No usable image or link matched the active grab strategy.'}`);
      return true;
    }
    void preview.strategy.execute(target);
    return true;
  }

  private activeGrabStrategy(): GrabStrategy {
    return this.grabStrategies.find((strategy) => strategy.id === this.activeTemplateGrabStrategy?.kind) ?? this.grabStrategies[1]!;
  }

  private activeGrabStrategyForTarget(target: Element): GrabStrategy {
    const sourcePattern = this.grabSourcePatternForTarget(target);
    const strategy = sourcePattern
      ? (normalizeGrabStrategy(sourcePattern.grabStrategy) ?? { kind: 'clicked-image' })
      : this.activeTemplateGrabStrategy;
    return this.grabStrategies.find((candidate) => candidate.id === strategy?.kind) ?? this.grabStrategies[1]!;
  }

  private resolveGrabPreview(target: Element): GrabPreviewResolution {
    const strategy = this.activeGrabStrategyForTarget(target);
    const previewElement = previewElementForTarget(target);
    if (strategy.id === 'linked-page-image') {
      const link = target.closest('a[href]');
      if (link instanceof HTMLAnchorElement) {
        const element = link instanceof HTMLElement ? link : previewElement;
        const linkUrl = safeHttpUrl(link.href, document.baseURI);
        return linkUrl ? { state: 'valid', element, strategy } : { state: 'invalid', element, strategy, reason: 'Link URL is not usable.' };
      }
    }

    const image = findImageFromShortcutTarget(target);
    if (!(image instanceof HTMLImageElement)) {
      return { state: 'invalid', element: previewElement, strategy, reason: 'No usable image target was found.' };
    }
    if (!isQualifyingImage(image)) {
      return { state: 'invalid', element: image, strategy, reason: getImageRejectionReason(image) ?? 'Image is not usable.' };
    }
    return { state: 'valid', element: image, strategy };
  }

  private applyGrabPreview(preview: GrabPreviewResolution): void {
    if (this.grabPreview?.element === preview.element && this.grabPreview.state === preview.state) return;
    this.clearGrabPreview();
    markGrabPreviewTarget(preview.element, preview.state);
    this.grabPreview = { element: preview.element, state: preview.state };
  }

  private clearGrabPreview(): void {
    if (!this.grabPreview) return;
    restoreGrabPreviewTarget(this.grabPreview.element);
    this.grabPreview = null;
  }

  private async grabClickedImage(target: Element): Promise<boolean> {
    const image = findImageFromShortcutTarget(target);
    if (!(image instanceof HTMLImageElement)) return false;
    if (!isQualifyingImage(image)) {
      this.emit(`Could not bookmark image: ${getImageRejectionReason(image) ?? 'Image is not usable.'}`);
      return true;
    }
    await this.bookmarkPageImage(image);
    return true;
  }

  private async grabLinkedPageImage(target: Element): Promise<boolean> {
    const link = target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return this.grabClickedImage(target);

    const pageUrl = safeHttpUrl(link.href, document.baseURI);
    if (!pageUrl) {
      this.emit('Could not grab linked page image: Link URL is not usable.');
      return true;
    }

    try {
      const sourcePattern = this.grabSourcePatternForTarget(target);
      const grabStrategy = sourcePattern
        ? (normalizeGrabStrategy(sourcePattern.grabStrategy) ?? { kind: 'clicked-image' })
        : this.activeTemplateGrabStrategy;
      const strategy = grabStrategy?.kind === 'linked-page-image' ? grabStrategy : DEFAULT_LINKED_PAGE_IMAGE_GRAB_STRATEGY;
      const imageUrl = await resolveLinkedPageImage(pageUrl.href, strategy);
      await this.emitBookmarkResolvedUrl(imageUrl);
      this.emit(`Grabbed ${summarizeTargetUrlForMessage(imageUrl)} with Linked page image.`);
    } catch (error) {
      this.emit(`Could not grab linked page image: ${error instanceof Error ? error.message : 'Strategy failed.'}`);
    }
    return true;
  }

  private handleGrabSourcePatternRequestEvent(event: MouseEvent): boolean {
    if (!event.metaKey || event.shiftKey || event.button !== 0) return false;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const sourceUrl = this.grabSourcePatternUrlForTarget(target);
    if (!sourceUrl) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    for (const listener of this.grabSourcePatternRequestListeners) listener(sourceUrl.href);
    return true;
  }

  private grabSourcePatternForTarget(target: Element): GrabSourcePattern | null {
    const sourceUrl = this.grabSourcePatternUrlForTarget(target);
    if (!sourceUrl) return null;
    try {
      return findBestMatchingGrabSourcePattern(this.grabSourcePatterns, parseUrl(sourceUrl.href));
    } catch {
      return null;
    }
  }

  private grabSourcePatternUrlForTarget(target: Element): URL | null {
    const link = target.closest('a[href]');
    if (link instanceof HTMLAnchorElement) {
      const linkUrl = safeHttpUrl(link.href, document.baseURI);
      if (linkUrl) return linkUrl;
    }
    const image = findImageFromShortcutTarget(target);
    if (image instanceof HTMLImageElement) {
      const imageUrl = safeHttpUrl(image.currentSrc || image.src, document.baseURI);
      if (imageUrl) return imageUrl;
    }
    return null;
  }

  private async bookmarkPageImage(image: HTMLImageElement): Promise<void> {
    const info = this.createBookmarkShortcutInfo(image);
    if (!info) {
      this.emit('Could not bookmark image: Image source could not be resolved.');
      return;
    }

    await this.emitBookmarkRequest(image, info);
    this.emit(`Grabbed ${summarizeTargetUrlForMessage(info.url)} with ${this.activeGrabStrategy().label}.`);
  }

  private async emitBookmarkResolvedUrl(url: string): Promise<void> {
    for (const listener of this.bookmarkRequestListeners) {
      listener({
        handleId: `image-trail-linked-page:${url}`,
        url,
        source: 'linkedPageExtractor',
      });
    }
  }

  private createBookmarkShortcutInfo(image: HTMLImageElement): TargetImageInfo | null {
    const baseInfo = createLoadedTargetImageInfo(image) ?? createTargetImageInfo(image);
    if (image !== this.selected || !this.selectedActiveUrl) return baseInfo;

    const rect = image.getBoundingClientRect();
    return {
      handleId: baseInfo?.handleId ?? image.getAttribute('data-image-trail-handle') ?? 'image-trail-selected-target',
      url: this.selectedActiveUrl,
      width: Math.round(image.naturalWidth || rect.width),
      height: Math.round(image.naturalHeight || rect.height),
      source: baseInfo?.source ?? 'srcProperty',
    };
  }

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
    this.selectedDisplayUrl = originalUrl;
    this.selectedProjectionId = null;
    this.selectedProjectionReason = null;
    this.mode = mode;
    const handleId = createTargetImageInfo(image)?.handleId;
    if (handleId) image.setAttribute('data-image-trail-handle', handleId);
    markSelectedTarget(image, { lockBox: this.selectedFillScreen, objectFit: this.selectedObjectFit });
    this.watchSelectedLoad(image);
  }

  private restoreSelectedTarget(): void {
    if (this.selected) {
      keepSelectedTargetBackdropBlack(this.selected);
      if (this.selectedOriginalSnapshot) {
        restoreImageNavigationSnapshot(this.selectedOriginalSnapshot);
      } else if (this.selectedOriginalUrl && createTargetImageInfo(this.selected)?.url !== this.selectedOriginalUrl) {
        applyImageUrl(this.selected, this.selectedOriginalUrl);
      }
      this.selected.removeAttribute('data-image-trail-handle');
      restoreElementStyles(this.selected);
    }
    if (this.preparedStandaloneBackdrop === this.selected) this.preparedStandaloneBackdrop = null;
    this.clearPendingLoadTarget();
    this.selected = null;
    this.selectedOriginalUrl = null;
    this.selectedOriginalSnapshot = null;
    this.selectedActiveUrl = null;
    this.selectedDisplayUrl = null;
    this.selectedProjectionId = null;
    this.selectedProjectionReason = null;
  }

  private restorePreparedStandaloneBackdrop(): void {
    const prepared = this.preparedStandaloneBackdrop;
    if (!prepared || prepared === this.selected) return;
    restoreElementStyles(prepared);
    this.preparedStandaloneBackdrop = null;
  }

  private watchSelectedLoad(image: HTMLImageElement): void {
    this.clearPendingLoadTarget();
    const expectedActiveUrl = image === this.selected ? this.selectedActiveUrl : null;
    const expectedDisplayUrl = image === this.selected ? this.selectedDisplayUrl : null;
    const expectedProjectionId = image === this.selected ? this.selectedProjectionId : null;
    const expectedProjectionReason = image === this.selected ? this.selectedProjectionReason : null;
    if (isSuccessfulImageLoad(image)) {
      void this.emitSuccessfulLoad(image, expectedActiveUrl, expectedDisplayUrl, expectedProjectionId, expectedProjectionReason);
      return;
    }

    this.pendingLoadTarget = image;
    this.pendingLoadActiveUrl = expectedActiveUrl;
    this.pendingLoadDisplayUrl = expectedDisplayUrl;
    this.pendingLoadProjectionId = expectedProjectionId;
    this.pendingLoadProjectionReason = expectedProjectionReason;
    image.addEventListener('load', this.onSelectedLoad, { once: true });
    image.addEventListener('error', this.onSelectedError, { once: true });
  }

  private clearPendingLoadTarget(): void {
    if (!this.pendingLoadTarget) return;
    this.pendingLoadTarget.removeEventListener('load', this.onSelectedLoad);
    this.pendingLoadTarget.removeEventListener('error', this.onSelectedError);
    this.pendingLoadTarget = null;
    this.pendingLoadActiveUrl = null;
    this.pendingLoadDisplayUrl = null;
    this.pendingLoadProjectionId = null;
    this.pendingLoadProjectionReason = null;
  }

  private onSelectedLoad = (event: Event): void => {
    const image = event.currentTarget;
    if (image instanceof HTMLImageElement && image === this.selected && isSuccessfulImageLoad(image)) {
      void this.emitSuccessfulLoad(
        image,
        this.pendingLoadActiveUrl,
        this.pendingLoadDisplayUrl,
        this.pendingLoadProjectionId,
        this.pendingLoadProjectionReason,
      );
    }
    this.clearPendingLoadTarget();
  };

  private onSelectedError = (event: Event): void => {
    const image = event.currentTarget;
    const failedActiveUrl = this.pendingLoadActiveUrl;
    const failedProjectionId = this.pendingLoadProjectionId;
    if (image === this.pendingLoadTarget) this.clearPendingLoadTarget();
    if (image !== this.selected || !failedActiveUrl || failedActiveUrl !== this.selectedActiveUrl) return;
    if ((failedProjectionId ?? null) !== this.selectedProjectionId) return;
    this.emit(failedActiveUrl.startsWith('data:') ? 'Failed to load data URL.' : `Failed to load ${failedActiveUrl}`);
  };

  private async emitSuccessfulLoad(
    image: HTMLImageElement,
    expectedActiveUrl: string | null = null,
    expectedDisplayUrl: string | null = null,
    expectedProjectionId: string | null = null,
    expectedProjectionReason: ProjectionReason | null = null,
  ): Promise<void> {
    if (image === this.selected && expectedActiveUrl !== this.selectedActiveUrl) return;
    if (image === this.selected && expectedProjectionId !== this.selectedProjectionId) return;
    if (image === this.selected && expectedDisplayUrl) {
      if (!imageLoadedUrlMatches(image, expectedDisplayUrl)) return;
    }
    if (image === this.selected) markSelectedTarget(image, { lockBox: this.selectedFillScreen, objectFit: this.selectedObjectFit });
    const target = createTargetImageInfo(image);
    if (!target) return;
    const reportedTarget = image === this.selected && this.selectedActiveUrl ? { ...target, url: this.selectedActiveUrl } : target;
    if (image === this.selected) {
      this.selectedActiveUrl = reportedTarget.url;
      this.emit(reportedTarget.url.startsWith('data:') ? 'Loaded data URL' : `Loaded ${reportedTarget.url}`);
    }
    const thumbnail = (await createThumbnailDataUrlFromImage(image)) ?? undefined;
    if (image === this.selected && expectedActiveUrl !== this.selectedActiveUrl) return;
    if (image === this.selected && expectedProjectionId !== this.selectedProjectionId) return;
    for (const listener of this.loadListeners) {
      listener({
        ...reportedTarget,
        thumbnail,
        trustedLoadedImage: true,
        projectionId: expectedProjectionId ?? undefined,
        projectionReason: expectedProjectionReason ?? undefined,
      });
    }
  }

  private clearHover(): void {
    if (this.hovered && this.hovered !== this.selected) {
      const candidate = this.hovered;
      restoreElementStyles(candidate);
      if (this.picking && this.candidates.has(candidate)) markPickModeCandidate(candidate);
    }
    this.hovered = null;
  }

  private restoreSelectedTargetStyles(): void {
    if (this.selected) restoreElementStyles(this.selected, { preserveBackdropBlack: true });
  }

  private createSnapshot(message: string): TargetSelectionSnapshot {
    const selected = this.selected?.isConnected ? createTargetImageInfo(this.selected) : null;
    return {
      mode: this.mode,
      picking: this.picking,
      grabModeActive: this.grabModeActive,
      candidateCount: this.picking ? this.candidates.size : this.detectedCandidateCount,
      selected: selected && this.selectedActiveUrl ? { ...selected, url: this.selectedActiveUrl } : selected,
      fillScreen: this.selectedFillScreen,
      objectFit: this.selectedObjectFit,
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

function imageLoadedUrlMatches(image: HTMLImageElement, expectedUrl: string): boolean {
  return [image.currentSrc, image.src, image.getAttribute('src')].some((url) => imageResourceUrlsEqual(url, expectedUrl, document.baseURI));
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

function previewElementForTarget(target: Element): HTMLElement {
  const image = findImageFromShortcutTarget(target);
  if (image instanceof HTMLElement) return image;
  const link = target.closest('a[href]');
  if (link instanceof HTMLElement) return link;
  const interactive = target.closest('[role="button"],article,[data-testid]');
  if (interactive instanceof HTMLElement) return interactive;
  return target instanceof HTMLElement ? target : document.body;
}

async function resolveLinkedPageImage(pageUrl: string, strategy: LinkedPageImageGrabStrategy): Promise<string> {
  const page = await fetchLinkedPageText(pageUrl, strategy);
  const html = page.text;
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const extractor of strategy.extractors) {
    let element: Element | null;
    try {
      element = document.querySelector(extractor.selector);
    } catch {
      continue;
    }
    const raw = element?.getAttribute(extractor.attribute)?.trim();
    const resolved = safeHttpUrl(raw, page.finalUrl);
    if (resolved) return resolved.href;
  }
  throw new Error('No image matched the configured extractors.');
}

async function fetchLinkedPageText(
  pageUrl: string,
  strategy: Pick<LinkedPageImageGrabStrategy, 'maxBytes' | 'timeoutMs'>,
): Promise<{ readonly text: string; readonly finalUrl: string }> {
  try {
    const response = await sendRuntimeMessage(createFetchLinkedPageMessage(pageUrl, strategy.maxBytes, strategy.timeoutMs));
    if (isFetchLinkedPageResultMessage(response)) {
      if (response.payload.ok) return { text: response.payload.text, finalUrl: response.payload.finalUrl };
      throw new Error(response.payload.message);
    }
  } catch (error) {
    if (error instanceof Error) throw error;
  }
  throw new Error('Linked page fetch failed.');
}

function safeHttpUrl(value: string | null | undefined, baseUrl: string): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
