import {
  createLoadLocalSettingsMessage,
  createSaveLocalSettingsMessage,
  isLoadLocalSettingsResultMessage,
  isSaveLocalSettingsResultMessage,
} from '../background/messages.js';
import { DEFAULT_LOCAL_SETTINGS, type LocalSettingsStore, type PlaintextLocalSettings } from '../data/local-settings.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionLocalSettingsStore implements LocalSettingsStore {
  async load(): Promise<PlaintextLocalSettings> {
    const response = await sendRuntimeMessage(createLoadLocalSettingsMessage());
    return isLoadLocalSettingsResultMessage(response) && response.payload.ok ? response.payload.settings : DEFAULT_LOCAL_SETTINGS;
  }

  async save(settings: PlaintextLocalSettings): Promise<void> {
    const response = await sendRuntimeMessage(createSaveLocalSettingsMessage(settings));
    if (response === null) return;
    if (isSaveLocalSettingsResultMessage(response) && response.payload.ok) return;
    throw new Error('Invalid local settings save response from background.');
  }
}
