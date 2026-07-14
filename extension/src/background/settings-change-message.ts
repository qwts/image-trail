export const SETTINGS_CHANGE_MESSAGE_TYPE = 'imageTrail.settingsChanged';
export const SETTINGS_CHANGE_MESSAGE_VERSION = 1;

export interface SettingsChangeMessage {
  readonly type: typeof SETTINGS_CHANGE_MESSAGE_TYPE;
  readonly version: typeof SETTINGS_CHANGE_MESSAGE_VERSION;
  readonly payload: {
    readonly changedAt: number;
  };
}

export function createSettingsChangeMessage(changedAt: number = Date.now()): SettingsChangeMessage {
  return {
    type: SETTINGS_CHANGE_MESSAGE_TYPE,
    version: SETTINGS_CHANGE_MESSAGE_VERSION,
    payload: { changedAt },
  };
}

export function isSettingsChangeMessage(value: unknown): value is SettingsChangeMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<SettingsChangeMessage>;
  return (
    message.type === SETTINGS_CHANGE_MESSAGE_TYPE &&
    message.version === SETTINGS_CHANGE_MESSAGE_VERSION &&
    typeof message.payload?.changedAt === 'number'
  );
}
