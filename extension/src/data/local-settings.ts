export interface PlaintextLocalSettings {
  readonly schemaVersion: 1;
  readonly showHistoryThumbnails: boolean;
  readonly requestThrottleMs: number;
  readonly panelDock: 'right' | 'left';
}

export const DEFAULT_LOCAL_SETTINGS: PlaintextLocalSettings = {
  schemaVersion: 1,
  showHistoryThumbnails: false,
  requestThrottleMs: 250,
  panelDock: 'right',
};

const LOCAL_SETTINGS_KEY = 'imageTrail.localSettings';
const MIN_REQUEST_THROTTLE_MS = 0;
const MAX_REQUEST_THROTTLE_MS = 60_000;

export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalSettingsRepository {
  constructor(private readonly storage: StringStorage = globalThis.localStorage) {}

  load(): PlaintextLocalSettings {
    const raw = this.storage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return DEFAULT_LOCAL_SETTINGS;

    try {
      return migrateLocalSettings(JSON.parse(raw) as Partial<PlaintextLocalSettings>);
    } catch {
      return DEFAULT_LOCAL_SETTINGS;
    }
  }

  save(settings: PlaintextLocalSettings): void {
    this.storage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(migrateLocalSettings(settings)));
  }
}

export function migrateLocalSettings(input: Partial<PlaintextLocalSettings>): PlaintextLocalSettings {
  return {
    schemaVersion: 1,
    showHistoryThumbnails: input.showHistoryThumbnails === true,
    requestThrottleMs: isSafeThrottle(input.requestThrottleMs) ? input.requestThrottleMs : DEFAULT_LOCAL_SETTINGS.requestThrottleMs,
    panelDock: input.panelDock === 'left' ? 'left' : 'right',
  };
}

function isSafeThrottle(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_REQUEST_THROTTLE_MS && value <= MAX_REQUEST_THROTTLE_MS;
}
