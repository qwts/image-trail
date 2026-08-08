import { useState } from 'react';

import {
  isSiteCaptureBehavior,
  normalizeSiteCaptureHostname,
  SITE_CAPTURE_RULE_LIMIT,
  updateSiteCaptureRule,
  type SiteCaptureBehavior,
} from '../core/site-capture-rules.js';
import { SettingField, SettingNote, type SettingsGroupProps } from './settings-shared.js';

function behaviorLabel(behavior: SiteCaptureBehavior): string {
  return behavior === 'capture-original' ? 'Pin + capture encrypted original' : 'Pin metadata only';
}

type RuleEntry = readonly [string, SiteCaptureBehavior];
type RuleUpdate = (hostname: string, behavior: SiteCaptureBehavior | null) => void;

function RuleForm(props: {
  readonly disabled: boolean;
  readonly privateMode: boolean;
  readonly ruleCount: number;
  readonly setError: (error: string | null) => void;
  readonly update: RuleUpdate;
}) {
  return (
    <form
      className="image-trail-destination-settings__form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const hostname = normalizeSiteCaptureHostname(form.get('siteCaptureHostname'));
        if (!hostname) return props.setError('Enter one exact hostname without a path, port, or wildcard.');
        const behavior = form.get('siteCaptureBehavior');
        if (!isSiteCaptureBehavior(behavior)) return;
        props.setError(null);
        props.update(hostname, behavior);
        event.currentTarget.reset();
      }}
    >
      <div className="image-trail-destination-settings__grid">
        <SettingField label="Exact hostname">
          <input
            name="siteCaptureHostname"
            type="text"
            placeholder={props.privateMode ? 'Exact hostname' : 'images.example.test'}
            disabled={props.disabled}
            required
          />
        </SettingField>
        <SettingField label="Explicit Grab click">
          <select name="siteCaptureBehavior" defaultValue="pin-only" disabled={props.disabled}>
            <option value="pin-only">Pin metadata only</option>
            <option value="capture-original">Pin + capture encrypted original</option>
          </select>
        </SettingField>
      </div>
      <button type="submit" disabled={props.disabled || props.ruleCount >= SITE_CAPTURE_RULE_LIMIT}>
        Add site rule
      </button>
    </form>
  );
}

function RuleList({
  disabled,
  entries,
  privateMode,
  update,
}: {
  disabled: boolean;
  entries: readonly RuleEntry[];
  privateMode: boolean;
  update: RuleUpdate;
}) {
  return (
    <ul className="image-trail-destination-settings__rule-list">
      {entries.map(([hostname, behavior], index) => {
        const displayHostname = privateMode ? `Saved site ${index + 1}` : hostname;
        return (
          <li key={hostname}>
            <span>{displayHostname}</span>
            <select
              aria-label={`Behavior for ${displayHostname}`}
              value={behavior}
              disabled={disabled}
              onChange={(event) => {
                if (isSiteCaptureBehavior(event.currentTarget.value)) update(hostname, event.currentTarget.value);
              }}
            >
              <option value="pin-only">Pin metadata only</option>
              <option value="capture-original">Pin + capture encrypted original</option>
            </select>
            <button type="button" disabled={disabled} onClick={() => update(hostname, null)}>
              Remove
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SiteCaptureRulesSettings({ settings, disabled, save }: SettingsGroupProps) {
  const [error, setError] = useState<string | null>(null);
  const entries = Object.entries(settings.siteCaptureRules).sort(([left], [right]) => left.localeCompare(right));
  const update: RuleUpdate = (hostname, behavior) => {
    save({ ...settings, siteCaptureRules: updateSiteCaptureRule(settings.siteCaptureRules, hostname, behavior) });
  };
  return (
    <div className="image-trail-destination-settings__subsection">
      <strong>Per-site Grab behavior</strong>
      <SettingNote>
        The default is Pin metadata only. A Capture rule still requires an explicit Grab click and stores original bytes only through
        encrypted original storage.
      </SettingNote>
      <RuleForm
        disabled={disabled}
        privateMode={settings.privacyModeEnabled}
        ruleCount={entries.length}
        setError={setError}
        update={update}
      />
      {error ? <p className="image-trail-destination-page__status is-error">{error}</p> : null}
      {entries.length === 0 ? <SettingNote>No site rules. Every explicit Grab click pins metadata only.</SettingNote> : null}
      {entries.length > 0 ? (
        <RuleList disabled={disabled} entries={entries} privateMode={settings.privacyModeEnabled} update={update} />
      ) : null}
      {entries.length > 0 ? <SettingNote>{entries.map(([, behavior]) => behaviorLabel(behavior)).join(' · ')}</SettingNote> : null}
    </div>
  );
}
