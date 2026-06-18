import { createCaptureOriginalMessage, isCaptureResultMessage } from '../background/messages.js';
import type { CaptureResult } from '../core/image/image-metadata.js';
import type { CaptureStore } from '../core/types.js';

export class BackgroundCaptureStore implements CaptureStore {
  async capture(url: string): Promise<CaptureResult> {
    const response = await chrome.runtime.sendMessage(createCaptureOriginalMessage(url, true));
    if (isCaptureResultMessage(response)) return response.payload;
    return {
      ok: false,
      status: 'failed',
      url,
      reason: 'unknown',
      message: 'Background capture did not return a valid result.',
    };
  }
}
