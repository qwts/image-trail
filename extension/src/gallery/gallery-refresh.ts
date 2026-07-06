import { isLibraryChangeMessage } from '../background/library-change-messages.js';

type RuntimeMessageListener = (message: unknown) => boolean;

interface RuntimeMessageEvent {
  addListener(listener: RuntimeMessageListener): void;
  removeListener(listener: RuntimeMessageListener): void;
}

export interface GalleryRefreshRuntime {
  readonly onMessage?: RuntimeMessageEvent;
}

export interface GalleryRefreshWindow {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(handle: number): void;
}

export interface GalleryRefreshHookOptions {
  readonly runtime: GalleryRefreshRuntime | undefined;
  readonly window: GalleryRefreshWindow;
  readonly refresh: () => void | Promise<void>;
  readonly debounceMs: number;
}

export function installGalleryLibraryRefreshHook({ runtime, window, refresh, debounceMs }: GalleryRefreshHookOptions): () => void {
  let refreshTimer: number | null = null;

  const runRefresh = () => {
    refreshTimer = null;
    void refresh();
  };

  const scheduleRefresh = () => {
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(runRefresh, debounceMs);
  };

  const listener: RuntimeMessageListener = (message) => {
    if (isLibraryChangeMessage(message)) scheduleRefresh();
    return false;
  };

  runtime?.onMessage?.addListener(listener);

  return () => {
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    runtime?.onMessage?.removeListener(listener);
  };
}
