import test from 'node:test';
import assert from 'node:assert/strict';

import { createLibraryChangeMessage } from '../../extension/src/background/library-change-messages.js';
import { installGalleryLibraryRefreshHook, type GalleryRefreshRuntime } from '../../extension/src/gallery/gallery-refresh.js';

type Listener = (message: unknown) => boolean;

class FakeRuntime implements GalleryRefreshRuntime {
  readonly listeners = new Set<Listener>();
  readonly onMessage = {
    addListener: (listener: Listener) => {
      this.listeners.add(listener);
    },
    removeListener: (listener: Listener) => {
      this.listeners.delete(listener);
    },
  };

  emit(message: unknown): void {
    for (const listener of this.listeners) listener(message);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

test('gallery library refresh hook debounces durable change notifications', async () => {
  const runtime = new FakeRuntime();
  let refreshCount = 0;
  const cleanup = installGalleryLibraryRefreshHook({
    runtime,
    window,
    debounceMs: 5,
    refresh: () => {
      refreshCount += 1;
    },
  });

  runtime.emit({ type: 'imageTrail.saveBookmarkResult' });
  runtime.emit(createLibraryChangeMessage({ topic: 'bookmarks', reason: 'bookmark-saved', recordIds: ['pin-1'] }));
  runtime.emit(createLibraryChangeMessage({ topic: 'albums', reason: 'album-records-added', albumIds: ['album-1'] }));
  await wait(20);

  assert.equal(refreshCount, 1);
  cleanup();
  runtime.emit(createLibraryChangeMessage({ topic: 'bookmarks', reason: 'bookmark-removed', recordIds: ['pin-1'] }));
  await wait(10);
  assert.equal(refreshCount, 1);
});
