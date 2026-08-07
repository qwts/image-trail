import { DomObserver } from '../../content/dom-observer.js';
import { PageContextDetector, pageContextMutationAffectsDetection } from '../../content/page-context-detection.js';
import type { PlaintextLocalSettings } from '../../content/panel-services.js';
import {
  normalizePageContextScope,
  pageContextStatesEqual,
  resolvePageContextState,
  updatePageContextOverrides,
  type PageContext,
  type PageContextDetection,
} from '../../core/page-context.js';
import type { PanelState } from '../../core/types.js';

declare const __IMAGE_TRAIL_PAGE_CONTEXT_SWITCHER_ENABLED__: boolean | undefined;

interface RefreshObserver {
  start(): void;
  stop(): void;
}

export interface PageContextControllerEnvironment {
  detect(): PageContextDetection;
  hostname(): string;
  createObserver(onRefresh: () => void): RefreshObserver;
  /** Test seam for the compile-time manual-override feature. */
  overridesEnabled?: boolean;
}

export interface PageContextControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  getLocalSettings(): PlaintextLocalSettings;
  saveLocalSettings(settings: PlaintextLocalSettings): void;
  render(): void;
}

function defaultEnvironment(): PageContextControllerEnvironment {
  const detector = new PageContextDetector();
  return {
    detect: () => detector.detect(),
    hostname: () => window.location.hostname,
    createObserver: (onRefresh) => {
      const observer = new DomObserver(onRefresh, {
        mutationFilter: pageContextMutationAffectsDetection,
        onMutations: (records) => detector.invalidate(records),
        observe: {
          attributes: true,
          attributeFilter: [
            'class',
            'data-full-src',
            'data-image-url',
            'data-media-url',
            'data-original',
            'data-src',
            'data-zoom-src',
            'disabled',
            'height',
            'hidden',
            'href',
            'media',
            'rel',
            'role',
            'sizes',
            'src',
            'srcset',
            'style',
            'width',
          ],
          childList: true,
          subtree: true,
        },
      });
      const handleLoad = (event: Event): void => {
        if (!(event.target instanceof HTMLImageElement)) return;
        detector.invalidateImage(event.target);
        observer.requestRefresh();
      };
      const handleLayoutChange = (): void => {
        detector.clear();
        observer.requestRefresh();
      };
      const handleVisibilityChange = (): void => {
        if (document.visibilityState === 'visible') handleLayoutChange();
      };
      return {
        start: () => {
          observer.start();
          document.addEventListener('load', handleLoad, true);
          document.addEventListener('visibilitychange', handleVisibilityChange);
          window.addEventListener('resize', handleLayoutChange);
        },
        stop: () => {
          observer.stop();
          document.removeEventListener('load', handleLoad, true);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('resize', handleLayoutChange);
        },
      };
    },
  };
}

export class PageContextController {
  private readonly observer: RefreshObserver;
  private active = false;
  private scope: string | null = null;

  constructor(
    private readonly deps: PageContextControllerDeps,
    private readonly environment: PageContextControllerEnvironment = defaultEnvironment(),
  ) {
    this.observer = environment.createObserver(() => this.refresh());
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.observer.start();
    this.refresh();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.observer.stop();
  }

  applyStoredOverride(): void {
    this.scope = normalizePageContextScope(this.environment.hostname());
    this.applyDetection(this.environment.detect(), this.storedOverride());
  }

  setOverride(context: PageContext | null): void {
    if (!this.overridesEnabled()) return;
    const state = this.deps.getState();
    if (context && !state.pageContext.available.includes(context)) return;
    this.scope = normalizePageContextScope(this.environment.hostname());
    const pageContext = resolvePageContextState(state.pageContext, context);
    this.deps.setState({ ...state, pageContext, lastUpdatedAt: Date.now() });
    const settings = this.deps.getLocalSettings();
    this.deps.saveLocalSettings({
      ...settings,
      pageContextOverrides: updatePageContextOverrides(settings.pageContextOverrides, this.environment.hostname(), context),
    });
    this.deps.render();
  }

  refresh(): void {
    const nextScope = normalizePageContextScope(this.environment.hostname());
    const scopeChanged = nextScope !== this.scope;
    this.scope = nextScope;
    const override = this.overridesEnabled() ? (scopeChanged ? this.storedOverride() : this.deps.getState().pageContext.override) : null;
    this.applyDetection(this.environment.detect(), override);
  }

  private storedOverride(): PageContext | null {
    if (!this.overridesEnabled() || !this.scope) return null;
    return this.deps.getLocalSettings().pageContextOverrides[this.scope]?.context ?? null;
  }

  private overridesEnabled(): boolean {
    if (this.environment.overridesEnabled !== undefined) return this.environment.overridesEnabled;
    return typeof __IMAGE_TRAIL_PAGE_CONTEXT_SWITCHER_ENABLED__ !== 'boolean' || __IMAGE_TRAIL_PAGE_CONTEXT_SWITCHER_ENABLED__;
  }

  private applyDetection(detection: PageContextDetection, override: PageContext | null): void {
    const state = this.deps.getState();
    const pageContext = resolvePageContextState(detection, override);
    if (pageContextStatesEqual(state.pageContext, pageContext)) return;
    this.deps.setState({ ...state, pageContext, lastUpdatedAt: Date.now() });
    if (state.visible) this.deps.render();
  }
}
