import {
  createLoadBuildIdentityMessage,
  isLoadBuildIdentityResultMessage,
  createStatusMessage,
  createUnknownMessageResponse,
  isExtensionRequest,
  MessageType,
} from '../background/messages.js';
import { isNonProductionBuildIdentity, type BuildIdentity } from '../core/build-info.js';
import { PageAdapter } from './page-adapter.js';
import { BuildIdentityOverlay } from './build-identity-overlay.js';
import { ExtensionBookmarkStore } from './extension-bookmark-store.js';
import { CaptureController } from './capture-controller.js';
import { RecentHistoryStore } from './recent-history-store.js';
import { RecallStore } from './recall-store.js';
import { ExtensionPanelPositionStore } from './panel-position-store.js';
import { ExtensionParsedFieldStateStore } from './parsed-field-state-store.js';
import { ExtensionLocalSettingsStore } from './local-settings-store.js';
import { ExtensionUrlTemplateStore } from './url-template-store.js';
import { ExtensionUrlReviewStatusStore } from './url-review-status-store.js';
import { ImageTrailPanel } from '../ui/panel.js';
import { sendRuntimeMessage } from './runtime-message.js';
import { classifyTarget, matchesKeyCodeShortcut, shouldRouteKeyboardShortcut } from './keyboard.js';

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

function isBuildIdentityOverlayShortcut(event: KeyboardEvent): boolean {
  return matchesKeyCodeShortcut(event, { code: 'KeyB', shift: true, alt: true });
}

async function loadBuildIdentity(): Promise<BuildIdentity | null> {
  try {
    const response = await sendRuntimeMessage(createLoadBuildIdentityMessage());
    if (!isLoadBuildIdentityResultMessage(response)) return null;
    if (response.payload.ok) return response.payload.identity;
    console.warn('Image Trail build identity could not be loaded.', response.payload.message);
    return null;
  } catch {
    return null;
  }
}

function createController(): ImageTrailContentController {
  const pageAdapter = new PageAdapter();
  pageAdapter.prepareStandaloneImageBackdrop({ requireBodyOnlyImage: true });
  const panel = new ImageTrailPanel(
    pageAdapter,
    new ExtensionBookmarkStore(),
    new CaptureController(),
    new RecentHistoryStore(),
    new RecallStore(),
    new ExtensionPanelPositionStore(),
    new ExtensionLocalSettingsStore(),
    new ExtensionUrlTemplateStore(),
    new ExtensionParsedFieldStateStore(),
    new ExtensionUrlReviewStatusStore(),
  );
  const buildOverlay = new BuildIdentityOverlay();
  let buildIdentity: BuildIdentity | null = null;
  let buildIdentityLoaded = false;
  void loadBuildIdentity().then((identity) => {
    buildIdentity = identity;
    buildIdentityLoaded = true;
    if (identity) panel.setBuildIdentity(identity);
    buildOverlay.show(identity);
  });

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

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!isBuildIdentityOverlayShortcut(event)) return;
    if (!shouldRouteKeyboardShortcut(classifyTarget(event), 'build-data-overlay-toggle')) return;
    if (!buildIdentityLoaded || !isNonProductionBuildIdentity(buildIdentity)) return;
    event.preventDefault();
    event.stopPropagation();
    buildOverlay.toggle(buildIdentity);
  };

  const destroy = (): void => {
    if (hasRuntimeMessaging()) chrome.runtime.onMessage.removeListener(handleMessage);
    document.removeEventListener('keydown', handleKeyDown, true);
    buildOverlay.hide();
    panel.disconnect();
    delete window.__imageTrailContentController;
  };

  chrome.runtime.onMessage.addListener(handleMessage);
  document.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('pagehide', (event) => {
    buildOverlay.hide();
    if (event.persisted) {
      panel.destroy();
      return;
    }
    destroy();
  });

  return { panel, destroy };
}

if (hasRuntimeMessaging() && !window.__imageTrailContentController) {
  window.__imageTrailContentController = createController();
}
