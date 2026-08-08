import { useCallback, useEffect, useState } from 'react';

import type { BuildIdentity } from '../core/build-info.js';
import type { PlaintextLocalSettings } from '../data/local-settings.js';
import type { DestinationServices } from './destination-services.js';
import { useRequestGeneration } from './request-generation.js';
import { AutomationSettingsGroup, SystemSettingsGroup, UtilitySettingsGroup } from './settings-automation-system.js';
import { DisplaySettingsGroup, PrivacySettingsGroup } from './settings-display-privacy.js';
import { UrlReviewStatusSettingsGroup } from './url-review-status-settings.js';

interface SettingsState {
  readonly settings: PlaintextLocalSettings | null;
  readonly identity: BuildIdentity | null;
  readonly busy: boolean;
  readonly message: string | null;
  readonly error: string | null;
}

function useSettings(services: DestinationServices) {
  const [state, setState] = useState<SettingsState>({ settings: null, identity: null, busy: true, message: null, error: null });
  const requests = useRequestGeneration();
  const load = useCallback(async () => {
    const request = requests.begin();
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const [settings, identity] = await Promise.all([services.loadSettings(), services.loadBuildIdentity()]);
      if (requests.isCurrent(request)) setState({ settings, identity, busy: false, message: null, error: null });
    } catch {
      if (requests.isCurrent(request)) {
        setState((current) => ({ ...current, busy: false, error: 'Settings could not be loaded.' }));
      }
    }
  }, [requests, services]);
  useEffect(() => {
    void load();
    return services.subscribeSettings(() => void load());
  }, [load, services]);
  const save = useCallback(
    async (settings: PlaintextLocalSettings) => {
      const request = requests.begin();
      setState((current) => ({ ...current, settings, busy: true, message: null, error: null }));
      try {
        await services.saveSettings(settings);
        if (requests.isCurrent(request)) {
          setState((current) => ({ ...current, settings, busy: false, message: 'Settings saved.' }));
        }
      } catch {
        if (requests.isCurrent(request)) {
          setState((current) => ({ ...current, busy: false, error: 'Settings could not be saved.' }));
        }
      }
    },
    [requests, services],
  );
  return { ...state, reload: load, save };
}

export function SettingsDestination({ services }: { readonly services: DestinationServices }) {
  const page = useSettings(services);
  if (!page.settings) {
    return (
      <div className="image-trail-destination-settings">
        <p className={`image-trail-destination-page__status${page.error ? ' is-error' : ''}`}>
          {page.error ?? 'Loading extension settings…'}
        </p>
        {page.error ? (
          <div className="image-trail-destination-page__actions">
            <button type="button" onClick={() => void page.reload()}>
              Retry
            </button>
          </div>
        ) : null}
      </div>
    );
  }
  const props = { settings: page.settings, disabled: page.busy, save: (settings: PlaintextLocalSettings) => void page.save(settings) };
  return (
    <div className="image-trail-destination-settings">
      <p className={`image-trail-destination-page__status${page.error ? ' is-error' : ''}`} aria-live="polite">
        {page.error ?? page.message ?? (page.busy ? 'Saving extension settings…' : 'Settings are extension-owned and shared across tabs.')}
      </p>
      <DisplaySettingsGroup {...props} />
      <PrivacySettingsGroup {...props} />
      <AutomationSettingsGroup {...props} />
      <UrlReviewStatusSettingsGroup services={services} privacyMode={page.settings.privacyModeEnabled} />
      <UtilitySettingsGroup {...props} />
      <SystemSettingsGroup {...props} identity={page.identity} />
    </div>
  );
}
