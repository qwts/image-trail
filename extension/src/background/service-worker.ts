import { createPingMessage, createTogglePanelMessage, isExtensionMessage, MessageType } from './messages.js';

const CONTENT_SCRIPT_FILE = 'src/content/content-script.js';
const SUPPORTED_PAGE_PATTERN = /^https?:\/\//u;

async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
}

async function sendToggle(tabId: number): Promise<void> {
  await ensureContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, createTogglePanelMessage());
  if (!isExtensionMessage(response) || response.type !== MessageType.Status) {
    console.warn('Image Trail received an unexpected toggle response.', response);
  }
}

async function pingTab(tabId: number): Promise<void> {
  const response = await chrome.tabs.sendMessage(tabId, createPingMessage());
  if (!isExtensionMessage(response) || response.type !== MessageType.Status) {
    console.warn('Image Trail received an unexpected ping response.', response);
  }
}

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id;
  if (typeof tabId !== 'number' || !tab.url || !SUPPORTED_PAGE_PATTERN.test(tab.url)) {
    console.warn('Image Trail can only be injected into http(s) pages.');
    return;
  }

  sendToggle(tabId)
    .then(() => pingTab(tabId))
    .catch((error: unknown) => {
      console.warn('Image Trail could not toggle the in-page panel.', error);
    });
});
