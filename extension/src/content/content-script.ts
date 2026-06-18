import { createStatusMessage, createUnknownMessageResponse, isExtensionRequest, MessageType } from '../background/messages.js';
import { PageAdapter } from './page-adapter.js';
import { IndexedDbBookmarkStore } from './bookmarks-controller.js';
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

function createController(): ImageTrailContentController {
  const pageAdapter = new PageAdapter();
  const panel = new ImageTrailPanel(pageAdapter, new IndexedDbBookmarkStore());

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
    }
  };

  const destroy = (): void => {
    chrome.runtime.onMessage.removeListener(handleMessage);
    panel.disconnect();
    delete window.__imageTrailContentController;
  };

  chrome.runtime.onMessage.addListener(handleMessage);
  window.addEventListener('pagehide', destroy, { once: true });

  return { panel, destroy };
}

if (!window.__imageTrailContentController) {
  window.__imageTrailContentController = createController();
}
