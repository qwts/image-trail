import { createStatusMessage, createUnknownMessageResponse, isExtensionRequest, MessageType } from '../background/messages.js';
import { PageAdapter } from './page-adapter.js';
import { ImageTrailPanel } from '../ui/panel.js';

interface ContentPanel {
  readonly visible: boolean;
  readonly statusMessage: string;
  readonly toggle: () => { readonly visible: boolean; readonly message: string };
  readonly disconnect: () => void;
}

interface ImageTrailContentController {
  readonly panel: ContentPanel;
  readonly destroy: () => void;
}

type ContentMessageHandler = (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => boolean;

type ContentControllerFactory = () => ContentPanel;

interface ContentMessagePort {
  readonly addListener: (handler: ContentMessageHandler) => void;
  readonly removeListener: (handler: ContentMessageHandler) => void;
}

interface ContentScriptRuntime {
  readonly window: Window;
  readonly onMessage: ContentMessagePort;
  readonly createPanel: ContentControllerFactory;
}

declare global {
  interface Window {
    __imageTrailContentController?: ImageTrailContentController;
  }
}

function defaultCreatePanel(): ContentPanel {
  const pageAdapter = new PageAdapter();
  return new ImageTrailPanel(pageAdapter);
}

function createController(runtime: ContentScriptRuntime): ImageTrailContentController {
  const panel = runtime.createPanel();

  const handleMessage: ContentMessageHandler = (message, _sender, sendResponse) => {
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
    runtime.onMessage.removeListener(handleMessage);
    runtime.window.removeEventListener('pagehide', destroy);
    panel.disconnect();
    delete runtime.window.__imageTrailContentController;
  };

  runtime.onMessage.addListener(handleMessage);
  runtime.window.addEventListener('pagehide', destroy, { once: true });

  return { panel, destroy };
}

export function initContentScript(runtime: Partial<ContentScriptRuntime> = {}): ImageTrailContentController | undefined {
  const targetWindow = runtime.window ?? (typeof window === 'undefined' ? undefined : window);
  const onMessage = runtime.onMessage ?? (typeof chrome === 'undefined' ? undefined : chrome.runtime?.onMessage);

  if (!targetWindow || !onMessage) {
    return undefined;
  }

  if (!targetWindow.__imageTrailContentController) {
    targetWindow.__imageTrailContentController = createController({
      window: targetWindow,
      onMessage,
      createPanel: runtime.createPanel ?? defaultCreatePanel,
    });
  }

  return targetWindow.__imageTrailContentController;
}

initContentScript();
