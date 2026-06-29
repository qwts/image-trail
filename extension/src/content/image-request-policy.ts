import {
  createCheckImageRequestPolicyMessage,
  isCheckImageRequestPolicyResultMessage,
  type CheckImageRequestPolicyResultMessage,
} from '../background/messages.js';
import type { ImageRequestIntent } from '../core/image/request-policy.js';
import { sendRuntimeMessage } from './runtime-message.js';

export async function checkImageRequestPolicy(
  url: string,
  options: { readonly intent?: ImageRequestIntent; readonly contextKey?: string } = {},
): Promise<CheckImageRequestPolicyResultMessage['payload']> {
  try {
    const response = await sendRuntimeMessage(createCheckImageRequestPolicyMessage(url, document.location.href, options));
    if (isCheckImageRequestPolicyResultMessage(response)) return response.payload;
  } catch {
    // Unknown policy is safer than blocking a request when the extension context is unavailable.
  }
  return { status: 'unknown' };
}
