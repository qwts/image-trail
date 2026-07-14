import { DomObserver } from '../../content/dom-observer.js';
import { detectPageContext } from '../../content/page-context-detection.js';
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

interface RefreshObserver {
  start(): void;
  stop(): void;
}

export interface PageContextControllerEnvironment {
  detect(): PageContextDetection;
  hostname(): string;
  createObserver(onRefresh: () => void): RefreshObserver;
}

export interface PageContextControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  getLocalSettings(): PlaintextLocalSettings;
  saveLocalSettings(settings: PlaintextLocalSettings): void;
  render(): void;
}

function defaultEnvironment(): PageContextControllerEnvironment {
  return {
    detect: () => detectPageContext(),
    hostname: () => window.location.hostname,
    createObserver: (onRefresh) => new DomObserver(onRefresh),
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
    const override = scopeChanged ? this.storedOverride() : this.deps.getState().pageContext.override;
    this.applyDetection(this.environment.detect(), override);
  }

  private storedOverride(): PageContext | null {
    if (!this.scope) return null;
    return this.deps.getLocalSettings().pageContextOverrides[this.scope]?.context ?? null;
  }

  private applyDetection(detection: PageContextDetection, override: PageContext | null): void {
    const state = this.deps.getState();
    const pageContext = resolvePageContextState(detection, override);
    if (pageContextStatesEqual(state.pageContext, pageContext)) return;
    this.deps.setState({ ...state, pageContext, lastUpdatedAt: Date.now() });
    if (state.visible) this.deps.render();
  }
}
