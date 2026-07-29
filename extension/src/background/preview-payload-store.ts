import { DEFAULT_MAX_ORIGINAL_BYTES } from '../core/image/capture-result.js';
import type { StoredMediaInfo } from '../core/media/media-info.js';

const PREVIEW_TTL_MS = 60_000;
const MAX_PENDING_PREVIEW_COUNT = 4;
const MAX_PENDING_PREVIEW_BYTES = DEFAULT_MAX_ORIGINAL_BYTES * 2;

export interface PreviewPayload {
  readonly dataUrl: string;
  readonly byteLength: number;
  readonly mediaInfo?: StoredMediaInfo | undefined;
}

interface StoredPreviewPayload extends PreviewPayload {
  readonly createdAt: number;
}

const previewPayloads = new Map<string, StoredPreviewPayload>();
let pendingPreviewBytes = 0;

export async function openPreviewPayload(
  payload: PreviewPayload,
): Promise<import('./messages.js').CreateBlobPreviewResultMessage['payload']> {
  if (!Number.isSafeInteger(payload.byteLength) || payload.byteLength < 1 || payload.byteLength > DEFAULT_MAX_ORIGINAL_BYTES) {
    return { ok: false, reason: 'preview-too-large', message: 'Preview payload is outside the encrypted-original size budget.' };
  }
  prunePreviewPayloads(Date.now(), payload.byteLength);
  const token = crypto.randomUUID();
  previewPayloads.set(token, { ...payload, createdAt: Date.now() });
  pendingPreviewBytes += payload.byteLength;
  setTimeout(() => removePreviewPayload(token), PREVIEW_TTL_MS);
  const previewUrl = chrome.runtime.getURL(`src/preview/preview.html#${encodeURIComponent(token)}`);
  try {
    await chrome.tabs.create({ url: previewUrl });
  } catch {
    removePreviewPayload(token);
    return { ok: false, reason: 'preview-blocked', message: 'Preview tab could not be opened by the extension.' };
  }
  return { ok: true, previewUrl, byteLength: payload.byteLength };
}

export function takePreviewPayload(token: string): PreviewPayload | null {
  const payload = previewPayloads.get(token);
  removePreviewPayload(token);
  if (!payload || Date.now() - payload.createdAt > PREVIEW_TTL_MS) return null;
  return payload;
}

function prunePreviewPayloads(now: number, incomingBytes: number): void {
  for (const [token, payload] of previewPayloads) {
    if (now - payload.createdAt > PREVIEW_TTL_MS) removePreviewPayload(token);
  }
  while (
    previewPayloads.size >= MAX_PENDING_PREVIEW_COUNT ||
    (previewPayloads.size > 0 && pendingPreviewBytes + incomingBytes > MAX_PENDING_PREVIEW_BYTES)
  ) {
    const oldestToken = previewPayloads.keys().next().value;
    if (typeof oldestToken !== 'string') break;
    removePreviewPayload(oldestToken);
  }
}

function removePreviewPayload(token: string): void {
  const payload = previewPayloads.get(token);
  if (!payload) return;
  previewPayloads.delete(token);
  pendingPreviewBytes = Math.max(0, pendingPreviewBytes - payload.byteLength);
}
