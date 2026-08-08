import type { PlaintextLocalSettings } from '../../content/panel-services.js';
import { reducePanelAction } from '../../core/actions.js';
import { normalizeSiteCaptureHostname, SITE_CAPTURE_RULE_LIMIT, type SiteCaptureBehavior } from '../../core/site-capture-rules.js';
import type { PanelState } from '../../core/types.js';

interface SiteCaptureRulesSettingsDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  getLocalSettings(): PlaintextLocalSettings;
  saveLocalSettings(settings: PlaintextLocalSettings): void;
  render(): void;
}

export class SiteCaptureRulesSettingsController {
  constructor(private readonly deps: SiteCaptureRulesSettingsDeps) {}

  update(rawHostname: string, behavior: SiteCaptureBehavior | null): void {
    const hostname = normalizeSiteCaptureHostname(rawHostname);
    if (!hostname) return;
    const state = this.deps.getState();
    const current = state.siteCaptureRules[hostname];
    if (behavior === null ? current === undefined : current === behavior) return;
    if (behavior !== null && current === undefined && Object.keys(state.siteCaptureRules).length >= SITE_CAPTURE_RULE_LIMIT) {
      this.deps.setState({
        ...state,
        status: 'error',
        message: `Per-site Grab behavior supports up to ${SITE_CAPTURE_RULE_LIMIT} saved sites. Remove a rule before adding another.`,
        lastUpdatedAt: Date.now(),
      });
      this.deps.render();
      return;
    }
    const next = reducePanelAction(state, { name: 'settings/update-site-capture-rule', hostname, behavior });
    this.deps.setState(next);
    this.deps.saveLocalSettings({ ...this.deps.getLocalSettings(), siteCaptureRules: next.siteCaptureRules });
    this.deps.render();
  }
}
