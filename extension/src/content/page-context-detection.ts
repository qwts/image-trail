import type { PageContext, PageContextDetection } from '../core/page-context.js';
import { findQualifyingImages, isQualifyingImage } from './target-image.js';

const PAGE_CONTEXT_IMAGE_ATTRIBUTES = [
  'data-full-src',
  'data-image-url',
  'data-media-url',
  'data-original',
  'data-src',
  'data-zoom-src',
  'height',
  'hidden',
  'sizes',
  'src',
  'srcset',
  'width',
] as const;

function isSemanticFeed(root: ParentNode, qualifyingImages: readonly HTMLImageElement[]): boolean {
  const feeds = new Set(root.querySelectorAll('[role="feed"]'));
  const articles = new Set(root.querySelectorAll('article'));
  const feedImageCounts = new Map<Element, number>();
  const imageBearingArticles = new Set<Element>();

  for (const image of qualifyingImages) {
    for (let ancestor = image.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (feeds.has(ancestor)) {
        const count = (feedImageCounts.get(ancestor) ?? 0) + 1;
        if (count >= 2) return true;
        feedImageCounts.set(ancestor, count);
      }
      if (articles.has(ancestor)) imageBearingArticles.add(ancestor);
    }
  }
  return imageBearingArticles.size >= 2;
}

function detectionFromImages(root: ParentNode, qualifyingImages: readonly HTMLImageElement[]): PageContextDetection {
  const imageCount = qualifyingImages.length;
  const detected: PageContext = imageCount > 1 ? (isSemanticFeed(root, qualifyingImages) ? 'feed' : 'gallery') : 'single';
  return { detected, available: availableContexts(imageCount), imageCount };
}

function availableContexts(imageCount: number): readonly PageContext[] {
  if (imageCount === 0) return [];
  if (imageCount === 1) return ['single'];
  return ['single', 'gallery', 'feed'];
}

export function detectPageContext(root: ParentNode = document): PageContextDetection {
  return detectionFromImages(root, findQualifyingImages(root));
}

export class PageContextDetector {
  private qualificationCache = new WeakMap<HTMLImageElement, boolean>();

  detect(root: ParentNode = document): PageContextDetection {
    const images = Array.from(root.querySelectorAll('img'));
    const qualifyingImages = images.filter((image) => this.qualifies(image));
    return detectionFromImages(root, qualifyingImages);
  }

  invalidate(records: readonly MutationRecord[]): void {
    for (const record of records) {
      if (record.type === 'attributes') this.invalidateNode(record.target);
      else {
        for (const node of record.addedNodes) this.invalidateNode(node);
        for (const node of record.removedNodes) this.invalidateNode(node);
      }
    }
  }

  clear(): void {
    this.qualificationCache = new WeakMap();
  }

  private qualifies(image: HTMLImageElement): boolean {
    const cached = this.qualificationCache.get(image);
    if (cached !== undefined) return cached;
    const qualifies = isQualifyingImage(image);
    this.qualificationCache.set(image, qualifies);
    return qualifies;
  }

  private invalidateNode(node: Node): void {
    if (node instanceof HTMLImageElement) this.qualificationCache.delete(node);
    if (!(node instanceof Element)) return;
    for (const image of node.querySelectorAll('img')) this.qualificationCache.delete(image);
  }
}

export function pageContextMutationAffectsDetection(records: readonly MutationRecord[]): boolean {
  return records.some((record) => {
    if (record.type === 'attributes') {
      return (
        record.attributeName === 'role' ||
        (record.target instanceof HTMLImageElement &&
          PAGE_CONTEXT_IMAGE_ATTRIBUTES.includes(record.attributeName as (typeof PAGE_CONTEXT_IMAGE_ATTRIBUTES)[number]))
      );
    }
    return [...record.addedNodes, ...record.removedNodes].some(nodeContainsImage);
  });
}

function nodeContainsImage(node: Node): boolean {
  return node instanceof HTMLImageElement || (node instanceof Element && node.querySelector('img') !== null);
}
