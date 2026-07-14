import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

const roots = new WeakMap<HTMLElement, Root>();
const REACT_SUBTREE_SELECTOR = '[data-image-trail-react-root]';

export function renderReactSubtree(container: HTMLElement, content: ReactNode): HTMLElement {
  const root = roots.get(container) ?? createRoot(container);
  if (!roots.has(container)) {
    roots.set(container, root);
    container.dataset['imageTrailReactRoot'] = 'true';
  }
  flushSync(() => root.render(content));
  return container;
}

export function unmountReactSubtree(container: HTMLElement): void {
  const root = roots.get(container);
  if (!root) return;
  root.unmount();
  roots.delete(container);
  delete container.dataset['imageTrailReactRoot'];
}

export function unmountReactSubtrees(container: HTMLElement): void {
  for (const subtree of Array.from(container.querySelectorAll<HTMLElement>(REACT_SUBTREE_SELECTOR))) {
    unmountReactSubtree(subtree);
  }
}
