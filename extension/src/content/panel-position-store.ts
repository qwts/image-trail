import {
  createDeletePanelPositionMessage,
  createLoadPanelPositionMessage,
  createSavePanelPositionMessage,
  isDeletePanelPositionResultMessage,
  isLoadPanelPositionResultMessage,
  isSavePanelPositionResultMessage,
} from '../background/messages.js';
import type { PanelPosition, PanelPositionStore } from '../core/types.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionPanelPositionStore implements PanelPositionStore {
  async load(hostname: string): Promise<PanelPosition | null> {
    const response = await sendRuntimeMessage(createLoadPanelPositionMessage(hostname));
    return isLoadPanelPositionResultMessage(response) && response.payload.ok ? response.payload.position : null;
  }

  async save(hostname: string, position: PanelPosition): Promise<void> {
    const response = await sendRuntimeMessage(createSavePanelPositionMessage(hostname, position));
    if (response === null || isSavePanelPositionResultMessage(response)) return;
    throw new Error('Invalid panel position save response from background.');
  }

  async remove(hostname: string): Promise<void> {
    const response = await sendRuntimeMessage(createDeletePanelPositionMessage(hostname));
    if (response === null || isDeletePanelPositionResultMessage(response)) return;
    throw new Error('Invalid panel position delete response from background.');
  }
}
