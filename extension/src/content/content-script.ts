import { createStatusMessage, createUnknownMessageResponse, isExtensionRequest, MessageType } from '../background/messages.js';
import { PageAdapter } from './page-adapter.js';
import { ExtensionBookmarkStore } from './extension-bookmark-store.js';
import { CaptureController } from './capture-controller.js';
import { RecentHistoryStore } from './recent-history-store.js';
import { RecallStore } from './recall-store.js';
import { ExtensionPanelPositionStore } from './panel-position-store.js';
import { ExtensionLocalSettingsStore } from './local-settings-store.js';
import { ExtensionUrlTemplateStore } from './url-template-store.js';
import { ImageTrailPanel } from '../ui/panel.js';

interface ImageTrailContentController {
  readonly panel: ImageTrailPanel;
  readonly destroy: () => void;
}

declare global {
  interface Window {
    __imageTrailContentController?: ImageTrailContentController;
  }
}

function hasRuntimeMessaging(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.onMessage && typeof chrome.runtime.getURL === 'function';
}

function createController(): ImageTrailContentController {
  const pageAdapter = new PageAdapter();
  const panel = new ImageTrailPanel(
    pageAdapter,
    new ExtensionBookmarkStore(),
    new CaptureController(),
    new RecentHistoryStore(),
    new RecallStore(),
    new ExtensionPanelPositionStore(),
    new ExtensionLocalSettingsStore(),
    new ExtensionUrlTemplateStore(),
  );

  const handleMessage = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void): boolean => {
    if (!isExtensionRequest(message)) {
      sendResponse(createUnknownMessageResponse('Unsupported Image Trail message.'));
      return false;
    }

    switch (message.type) {
      case MessageType.TogglePanel: {
        const state = panel.toggle();
        sendResponse(createStatusMessage(state.visible, state.message));
        return false;
      }
      case MessageType.Ping:
        sendResponse(createStatusMessage(panel.visible, panel.statusMessage));
        return false;
      default:
        return false;
    }
  };

  const destroy = (): void => {
    if (hasRuntimeMessaging()) chrome.runtime.onMessage.removeListener(handleMessage);
    panel.disconnect();
    delete window.__imageTrailContentController;
  };

  chrome.runtime.onMessage.addListener(handleMessage);
  window.addEventListener('pagehide', destroy, { once: true });

  return { panel, destroy };
}

if (hasRuntimeMessaging() && !window.__imageTrailContentController) {
  window.__imageTrailContentController = createController();
}
