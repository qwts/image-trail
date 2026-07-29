import { credentialsForImageRequest } from './fetch-image.js';
import type { FetchLinkedPageMessage, FetchLinkedPageResultMessage } from './messages.js';
import { hasOriginPermission } from './permissions.js';

const MAX_LINKED_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_LINKED_PAGE_TIMEOUT_MS = 15_000;

interface FetchLinkedPageDependencies {
  readonly fetchImpl?: typeof fetch;
  readonly hasPermission?: (origin: string) => Promise<boolean>;
}

export async function fetchLinkedPage(
  message: FetchLinkedPageMessage,
  dependencies: FetchLinkedPageDependencies = {},
): Promise<FetchLinkedPageResultMessage['payload']> {
  const url = toHttpUrl(message.payload.url);
  if (!url) {
    return { ok: false, reason: 'unsupported-url', message: 'Linked page URL must use HTTP or HTTPS.' };
  }

  const hasPermission = dependencies.hasPermission ?? hasOriginPermission;
  if (!(await hasPermission(url.origin))) {
    return {
      ok: false,
      reason: 'permission-needed',
      message: `Permission needed for ${url.origin}.`,
      origin: url.origin,
    };
  }

  const maxBytes = Math.min(MAX_LINKED_PAGE_BYTES, Math.max(32_768, message.payload.maxBytes));
  const timeoutMs = Math.min(MAX_LINKED_PAGE_TIMEOUT_MS, Math.max(1000, message.payload.timeoutMs));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = dependencies.fetchImpl ?? fetch;
    const response = await fetchImpl(url.href, {
      credentials: credentialsForImageRequest(url.href, message.payload.referrer),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: 'http-error', message: `Linked page returned ${response.status}.` };
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) {
      return { ok: false, reason: 'too-large', message: 'Linked page is larger than the strategy limit.' };
    }

    const result = await readLimitedText(response, maxBytes);
    return { ok: true, text: result.text, byteLength: result.byteLength, finalUrl: response.url || url.href };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, reason: 'timeout', message: 'Linked page fetch timed out.' };
    }
    if (error instanceof Error && error.message === 'too-large') {
      return { ok: false, reason: 'too-large', message: 'Linked page is larger than the strategy limit.' };
    }
    return { ok: false, reason: 'network-error', message: 'Linked page fetch failed.' };
  } finally {
    clearTimeout(timeout);
  }
}

function toHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

async function readLimitedText(response: Response, maxBytes: number): Promise<{ readonly text: string; readonly byteLength: number }> {
  if (!response.body) {
    const text = await response.text();
    const byteLength = new TextEncoder().encode(text).byteLength;
    if (byteLength > maxBytes) throw new Error('too-large');
    return { text, byteLength };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new Error('too-large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return { text: text + decoder.decode(), byteLength };
}
