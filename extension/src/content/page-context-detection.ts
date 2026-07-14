import type { PageContext, PageContextDetection } from '../core/page-context.js';
import { findQualifyingImages } from './target-image.js';

function imageBearingItemCount(root: ParentNode, selector: string): number {
  return Array.from(root.querySelectorAll(selector)).filter((item) => findQualifyingImages(item).length > 0).length;
}

function isSemanticFeed(root: ParentNode): boolean {
  const feeds = Array.from(root.querySelectorAll('[role="feed"]'));
  if (feeds.some((feed) => findQualifyingImages(feed).length >= 2)) return true;
  return imageBearingItemCount(root, 'article') >= 2;
}

function availableContexts(imageCount: number): readonly PageContext[] {
  if (imageCount === 0) return [];
  if (imageCount === 1) return ['single'];
  return ['single', 'gallery', 'feed'];
}

export function detectPageContext(root: ParentNode = document): PageContextDetection {
  const imageCount = findQualifyingImages(root).length;
  const detected: PageContext = imageCount > 1 ? (isSemanticFeed(root) ? 'feed' : 'gallery') : 'single';
  return { detected, available: availableContexts(imageCount), imageCount };
}
