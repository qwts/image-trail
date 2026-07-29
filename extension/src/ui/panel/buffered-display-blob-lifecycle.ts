import { imageResourceUrlsEqual } from '../../core/image/image-navigation.js';
import { reduceBufferedImageNavigation, type BufferedImageNavigationState } from '../../core/url/buffered-image-navigation.js';

interface ActiveBufferedDisplay {
  readonly url: string;
  readonly blobUrl: string;
}

interface BufferedDisplayLanding {
  readonly previous: ActiveBufferedDisplay | null;
  readonly next: ActiveBufferedDisplay | null;
  readonly revision: number;
}

export class BufferedDisplayBlobLifecycle {
  private active: ActiveBufferedDisplay | null = null;
  private revision = 0;

  constructor(private readonly scheduleRevoke: (blobUrl: string) => void) {}

  get activeBlobUrl(): string | undefined {
    return this.active?.blobUrl;
  }

  async applyLanding(url: string, displayUrl: string, apply: () => Promise<boolean>): Promise<boolean> {
    const landing = this.stageLanding(url, displayUrl);
    try {
      const loaded = await apply();
      if (!loaded) this.restoreLanding(landing);
      return loaded;
    } catch (error) {
      this.restoreLanding(landing);
      throw error;
    }
  }

  stageLanding(url: string, displayUrl: string): BufferedDisplayLanding {
    const next = displayUrl.startsWith('blob:') ? { url, blobUrl: displayUrl } : null;
    const landing = { previous: this.active, next, revision: (this.revision += 1) };
    this.active = next;
    return landing;
  }

  restoreLanding(landing: BufferedDisplayLanding): void {
    if (this.revision !== landing.revision) return;
    this.active = landing.previous;
    this.revision += 1;
  }

  matches(url: string, pageHref: string): boolean {
    return this.active !== null && imageResourceUrlsEqual(this.active.url, url, pageHref);
  }

  replaceWindow(navigation: BufferedImageNavigationState | null, preserveActive: boolean): void {
    const preservedBlobUrl = preserveActive ? this.active?.blobUrl : undefined;
    const scheduled = new Set<string>();
    for (const { blobUrl } of navigation?.indices.values() ?? []) {
      if (!blobUrl?.startsWith('blob:') || blobUrl === preservedBlobUrl || scheduled.has(blobUrl)) continue;
      scheduled.add(blobUrl);
      this.scheduleRevoke(blobUrl);
    }
    if (!preserveActive && this.active && !scheduled.has(this.active.blobUrl)) this.scheduleRevoke(this.active.blobUrl);
    if (!preserveActive) {
      this.active = null;
      this.revision += 1;
    }
  }

  evictOutsideWindow(navigation: BufferedImageNavigationState, liveIndices: ReadonlySet<number>): BufferedImageNavigationState {
    let next = navigation;
    for (const [index, entry] of navigation.indices) {
      if (liveIndices.has(index)) continue;
      if (entry.blobUrl?.startsWith('blob:')) this.scheduleRevoke(entry.blobUrl);
      next = reduceBufferedImageNavigation(next, { type: 'EVICT', index });
    }
    return next;
  }
}
