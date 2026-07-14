import type { BuildIdentity } from '../core/build-info.js';
import type { ImageProbeMethod } from '../core/image/request-policy.js';
import type { LoadFailureFeedback } from '../core/settings.js';
import type { ObjectFitMode } from '../core/preview-style.js';
import {
  ApplyButton,
  formValues,
  numberValue,
  selectValue,
  SettingField,
  SettingsGroup,
  SettingNote,
  SettingToggle,
  type SettingsGroupProps,
} from './settings-shared.js';

export function AutomationSettingsGroup({ settings, disabled, save }: SettingsGroupProps) {
  return (
    <SettingsGroup title="Automation">
      <AutomationRequestForm settings={settings} disabled={disabled} save={save} />
      <SettingToggle
        label="Warm adjacent parsed-field images"
        checked={settings.neighborPreloadEnabled}
        disabled={disabled}
        onChange={(checked) => save({ ...settings, neighborPreloadEnabled: checked })}
      />
      <SettingToggle
        label="Clear site review status after export"
        checked={settings.clearUrlReviewStatusAfterExport}
        disabled={disabled}
        onChange={(checked) => save({ ...settings, clearUrlReviewStatusAfterExport: checked })}
      />
      <div className="image-trail-destination-page__unavailable">
        <strong>Keybindings</strong>
        <p>The canonical bare-key registry and assignable Down arrow are owned by #519.</p>
      </div>
    </SettingsGroup>
  );
}

function AutomationRequestForm({ settings, disabled, save }: SettingsGroupProps) {
  return (
    <form
      key={automationFormKey(settings)}
      className="image-trail-destination-settings__form"
      onSubmit={(event) => {
        const data = formValues(event);
        save({
          ...settings,
          requestThrottleMs: numberValue(data, 'requestThrottleMs'),
          requestThrottleMaxRequests: numberValue(data, 'requestThrottleMaxRequests'),
          requestThrottleWindowMs: numberValue(data, 'requestThrottleWindowMs'),
          neighborPreloadRadius: numberValue(data, 'neighborPreloadRadius'),
          neighborPreloadCacheLimit: numberValue(data, 'neighborPreloadCacheLimit'),
          neighborPreloadProbeMethod: selectValue<ImageProbeMethod>(data, 'neighborPreloadProbeMethod'),
          loadFailureFeedback: selectValue<LoadFailureFeedback>(data, 'loadFailureFeedback'),
          urlReviewStatusLimit: numberValue(data, 'urlReviewStatusLimit'),
        });
      }}
    >
      <AutomationRequestFields settings={settings} />
      <ApplyButton disabled={disabled} />
    </form>
  );
}

function automationFormKey(settings: SettingsGroupProps['settings']): string {
  return [
    settings.requestThrottleMs,
    settings.requestThrottleMaxRequests,
    settings.requestThrottleWindowMs,
    settings.neighborPreloadRadius,
    settings.neighborPreloadCacheLimit,
    settings.neighborPreloadProbeMethod,
    settings.loadFailureFeedback,
    settings.urlReviewStatusLimit,
  ].join(':');
}

function AutomationRequestFields({ settings }: Pick<SettingsGroupProps, 'settings'>) {
  return (
    <div className="image-trail-destination-settings__grid is-three">
      <SettingField label="Min interval ms">
        <input name="requestThrottleMs" type="number" min="0" max="60000" defaultValue={settings.requestThrottleMs} required />
      </SettingField>
      <SettingField label="Max requests">
        <input
          name="requestThrottleMaxRequests"
          type="number"
          min="1"
          max="1000"
          defaultValue={settings.requestThrottleMaxRequests}
          required
        />
      </SettingField>
      <SettingField label="Window ms">
        <input
          name="requestThrottleWindowMs"
          type="number"
          min="1000"
          max="300000"
          defaultValue={settings.requestThrottleWindowMs}
          required
        />
      </SettingField>
      <SettingField label="Ahead / behind">
        <input name="neighborPreloadRadius" type="number" min="1" max="5" defaultValue={settings.neighborPreloadRadius} required />
      </SettingField>
      <SettingField label="Cache">
        <input
          name="neighborPreloadCacheLimit"
          type="number"
          min="0"
          max="500"
          defaultValue={settings.neighborPreloadCacheLimit}
          required
        />
      </SettingField>
      <SettingField label="Probe">
        <select name="neighborPreloadProbeMethod" defaultValue={settings.neighborPreloadProbeMethod}>
          <option value="get">GET</option>
          <option value="head">HEAD</option>
        </select>
      </SettingField>
      <SettingField label="Failure feedback">
        <select name="loadFailureFeedback" defaultValue={settings.loadFailureFeedback}>
          <option value="mute">Mute</option>
          <option value="display">Field only</option>
          <option value="alert">Field and toast</option>
        </select>
      </SettingField>
      <SettingField label="URL review cap">
        <input name="urlReviewStatusLimit" type="number" min="10" max="20000" defaultValue={settings.urlReviewStatusLimit} required />
      </SettingField>
    </div>
  );
}

export function UtilitySettingsGroup({ settings, disabled, save }: SettingsGroupProps) {
  return (
    <SettingsGroup title="Utilities">
      <SettingToggle
        label="Show build identity overlay on source pages"
        checked={settings.buildInfoOverlayVisible}
        disabled={disabled}
        onChange={(checked) => save({ ...settings, buildInfoOverlayVisible: checked })}
      />
      <SettingField label="Image preview fit">
        <select
          value={settings.previewObjectFit}
          disabled={disabled}
          onChange={(event) => save({ ...settings, previewObjectFit: event.currentTarget.value as ObjectFitMode })}
        >
          <option value="contain">Contain</option>
          <option value="cover">Cover</option>
          <option value="fill">Fill</option>
          <option value="none">None</option>
          <option value="scale-down">Scale down</option>
        </select>
      </SettingField>
      <SettingNote>
        Import, export, encrypted-image transfer, and current-image download stay in the source panel because they require explicit file or
        row context.
      </SettingNote>
    </SettingsGroup>
  );
}

export function SystemSettingsGroup({
  settings,
  disabled,
  save,
  identity,
}: SettingsGroupProps & { readonly identity: BuildIdentity | null }) {
  return (
    <SettingsGroup title="System">
      <SettingToggle
        label="Restore workspace layout for matching URL structures"
        checked={settings.restoreWorkspaceLayout}
        disabled={disabled}
        onChange={(checked) => save({ ...settings, restoreWorkspaceLayout: checked })}
      />
      <div className="image-trail-destination-settings__readout">
        <span>
          Version <strong>{identity?.version ?? 'Unavailable'}</strong>
        </span>
        <span>
          Commit <strong>{identity?.commit ?? 'Unavailable'}</strong>
        </span>
        <span>
          Branch <strong>{identity?.branch ?? 'Unavailable'}</strong>
        </span>
        <span>
          Mode <strong>{identity?.mode ?? 'Unavailable'}</strong>
        </span>
      </div>
      <div className="image-trail-destination-page__unavailable">
        <strong>Workspace reset</strong>
        <p>Reset remains source-bound because saved layout is keyed by the active page URL structure.</p>
      </div>
    </SettingsGroup>
  );
}
