import { createStatusMessage, createUnknownMessageResponse, isExtensionMessage, MessageType } from '../background/messages.js';
import { ImageTrailPanel } from '../ui/panel.js';

const panel = new ImageTrailPanel();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (response: unknown) => void) => {
  if (!isExtensionMessage(message)) {
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
    case MessageType.Status:
      sendResponse(createStatusMessage(panel.visible, panel.statusMessage));
      return false;
  }
});

window.addEventListener('pagehide', () => panel.destroy(), { once: true });
