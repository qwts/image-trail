import {
  createConnectPCloudProviderMessage,
  createDisconnectPCloudProviderMessage,
  createPCloudProviderStatusMessage,
  isConnectPCloudProviderResultMessage,
  isDisconnectPCloudProviderResultMessage,
  isPCloudProviderStatusResultMessage,
} from '../background/messages.js';
import type { PCloudProviderResult, PCloudProviderStatus } from '../core/cloud/pcloud-provider.js';

function hasRuntimeMessaging(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;
}

function unavailableStatus(): PCloudProviderStatus {
  return { connected: false, message: 'pCloud connection is only available in the extension runtime.' };
}

export async function loadPCloudProviderStatus(): Promise<PCloudProviderStatus> {
  if (!hasRuntimeMessaging()) return unavailableStatus();
  const response = await chrome.runtime.sendMessage(createPCloudProviderStatusMessage());
  return isPCloudProviderStatusResultMessage(response) ? response.payload : unavailableStatus();
}

export async function connectPCloudProvider(): Promise<PCloudProviderResult> {
  if (!hasRuntimeMessaging()) {
    const status = unavailableStatus();
    return { ok: false, status, message: status.message ?? 'pCloud connection is unavailable.' };
  }
  const response = await chrome.runtime.sendMessage(createConnectPCloudProviderMessage());
  if (isConnectPCloudProviderResultMessage(response)) return response.payload;
  const status = { connected: false, message: 'pCloud connection failed.' };
  return { ok: false, status, message: status.message };
}

export async function disconnectPCloudProvider(): Promise<PCloudProviderResult> {
  if (!hasRuntimeMessaging()) {
    const status = unavailableStatus();
    return { ok: false, status, message: status.message ?? 'pCloud disconnect is unavailable.' };
  }
  const response = await chrome.runtime.sendMessage(createDisconnectPCloudProviderMessage());
  if (isDisconnectPCloudProviderResultMessage(response)) return response.payload;
  const status = { connected: false, message: 'pCloud disconnect failed.' };
  return { ok: false, status, message: status.message };
}
