import { computeSha256 } from '../core/image/fingerprints.js';
import type { ImageProbeMethod, ImageRequestContext, ImageRequestIntent } from '../core/image/request-policy.js';
import { DEFAULT_MAX_ORIGINAL_BYTES } from '../core/image/capture-result.js';
import { fetchImageBytes } from './fetch-image.js';

export const MAX_THUMBNAIL_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_BUFFERED_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_SPECULATIVE_PROBE_CACHE_ENTRIES = 128;
const MAX_SKIPPABLE_FAILURE_CACHE_ENTRIES = 128;
const MAX_COMPLETED_GET_CACHE_ENTRIES = 48;
const MAX_COMPLETED_GET_CACHE_BYTES = 128 * 1024 * 1024;
const SPECULATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

export type ImageProbeResult =
  | { readonly ok: true; readonly status: number; readonly finalUrl: string }
  | { readonly ok: false; readonly status?: number; readonly reason: string; readonly message: string };

export type ImageBytesResult =
  | { readonly ok: true; readonly bytes: ArrayBuffer; readonly mimeType: string; readonly byteLength: number; readonly sha256?: string }
  | { readonly ok: false; readonly reason: string; readonly message: string };

export type ThumbnailSourceResult =
  | { readonly ok: true; readonly dataUrl: string; readonly mimeType: string; readonly byteLength: number; readonly sha256?: string }
  | { readonly ok: false; readonly reason: string; readonly message: string };

export type ImageRequestPolicyResult =
  | { readonly status: 'unknown' }
  | { readonly status: 'cached-success' }
  | { readonly status: 'skippable-failed'; readonly reason: string; readonly message: string };

interface SpeculativeProbeCacheEntry {
  readonly result: ImageProbeResult;
  readonly cachedAt: number;
}

interface CompletedGetCacheEntry {
  readonly result: Extract<ImageBytesResult, { readonly ok: true }>;
  readonly cachedAt: number;
  readonly cacheBytes: number;
}

interface SkippableFailureCacheEntry {
  readonly result: ImageRequestPolicyResult & { readonly status: 'skippable-failed' };
  readonly cachedAt: number;
}

export interface ImageRequestManagerOptions {
  readonly fetchImage?: typeof fetchImageBytes;
  readonly fetch?: typeof fetch;
  readonly sha256?: typeof computeSha256;
  readonly now?: () => number;
}

type ImageBytesRequestContext = Omit<ImageRequestContext, 'intent'> & { readonly intent?: ImageRequestIntent };
type ImageProbeRequestContext = Omit<ImageRequestContext, 'intent'> & {
  readonly timeoutMs: number;
  readonly probeMethod?: ImageProbeMethod;
};

export class ImageRequestManager {
  private readonly fetchImage: typeof fetchImageBytes;
  private readonly fetchImpl: typeof fetch;
  private readonly sha256: typeof computeSha256;
  private readonly now: () => number;
  private readonly speculativeProbeCache = new Map<string, SpeculativeProbeCacheEntry>();
  private readonly skippableFailureCache = new Map<string, SkippableFailureCacheEntry>();
  private readonly getInflight = new Map<string, Promise<ImageBytesResult>>();
  private readonly completedGetCache = new Map<string, CompletedGetCacheEntry>();
  private completedGetCacheBytes = 0;

  constructor(options: ImageRequestManagerOptions = {}) {
    this.fetchImage = options.fetchImage ?? fetchImageBytes;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sha256 = options.sha256 ?? computeSha256;
    this.now = options.now ?? Date.now;
  }

  async probeSpeculativeImage(url: string, context: ImageProbeRequestContext): Promise<ImageProbeResult> {
    const probeMethod = context.probeMethod ?? 'get';
    const cacheKey = this.speculativeCacheKey(url, context.contextKey, probeMethod, context.referrer);
    const cached = this.speculativeProbeCacheResult(cacheKey);
    if (cached) return cached.result;
    const result =
      probeMethod === 'head'
        ? await this.headProbe(url, context.referrer, context.timeoutMs)
        : await this.getProbe(url, { referrer: context.referrer, contextKey: context.contextKey }, context.timeoutMs);
    this.rememberSpeculativeProbe(cacheKey, result);
    if (!result.ok && isSkippableProbeFailure(result)) {
      this.rememberSkippableFailure(url, MAX_BUFFERED_IMAGE_BYTES, context.referrer, result.reason, result.message);
    }
    return result;
  }

  async fetchThumbnail(url: string, context: ImageBytesRequestContext = {}): Promise<ThumbnailSourceResult> {
    const result = await this.fetchBytes(url, MAX_THUMBNAIL_SOURCE_BYTES, context);
    if (!result.ok) return result;
    return {
      ok: true,
      dataUrl: `data:${result.mimeType};base64,${arrayBufferToBase64(result.bytes)}`,
      mimeType: result.mimeType,
      byteLength: result.byteLength,
      sha256: result.sha256,
    };
  }

  async fetchBufferedImage(url: string, context: ImageBytesRequestContext = {}): Promise<ImageBytesResult> {
    return this.fetchBytes(url, MAX_BUFFERED_IMAGE_BYTES, context);
  }

  async fetchOriginalImage(url: string, context: ImageBytesRequestContext = {}): Promise<ImageBytesResult> {
    return this.fetchBytes(url, DEFAULT_MAX_ORIGINAL_BYTES, context, { useCompletedCache: false });
  }

  clearSpeculativeContext(contextKey: string): void {
    for (const key of this.speculativeProbeCache.keys()) {
      if (key.startsWith(`${contextKey}\n`)) this.speculativeProbeCache.delete(key);
    }
  }

  clearSpeculativeCache(): void {
    this.speculativeProbeCache.clear();
  }

  checkRequestPolicy(url: string, context: ImageBytesRequestContext = {}): ImageRequestPolicyResult {
    return this.checkRequestPolicyForBytes(url, MAX_BUFFERED_IMAGE_BYTES, context);
  }

  private checkRequestPolicyForBytes(url: string, maxBytes: number, context: ImageBytesRequestContext = {}): ImageRequestPolicyResult {
    if (!isSpeculativeImageIntent(context.intent)) return { status: 'unknown' };
    if (this.hasCompletedGetCacheResult(url, maxBytes, context.referrer)) return { status: 'cached-success' };
    return this.skippableFailureCacheResult(this.skippableFailureCacheKey(url, maxBytes, context.referrer)) ?? { status: 'unknown' };
  }

  private async fetchBytes(
    url: string,
    maxBytes: number,
    context: ImageBytesRequestContext,
    options: { readonly useCompletedCache?: boolean } = {},
  ): Promise<ImageBytesResult> {
    const policy = this.checkRequestPolicyForBytes(url, maxBytes, context);
    if (policy.status === 'skippable-failed') {
      return { ok: false, reason: policy.reason, message: policy.message };
    }
    const cacheKey = this.getInflightKey(url, maxBytes, context.referrer);
    if (options.useCompletedCache !== false) {
      const cached = this.completedGetCacheResult(cacheKey, url, maxBytes, context.referrer);
      if (cached) return cached;
    }
    const inflight = this.getInflight.get(cacheKey);
    if (inflight) return inflight;
    const promise = this.fetchBytesUncached(url, maxBytes, context);
    this.getInflight.set(cacheKey, promise);
    const result = await promise.finally(() => {
      this.getInflight.delete(cacheKey);
    });
    if (!result.ok && isSpeculativeImageIntent(context.intent)) {
      this.rememberSkippableFailure(url, maxBytes, context.referrer, result.reason, result.message);
    }
    if (options.useCompletedCache !== false && result.ok) this.rememberCompletedGet(cacheKey, result);
    return cloneImageBytesResult(result);
  }

  private async fetchBytesUncached(url: string, maxBytes: number, context: ImageBytesRequestContext): Promise<ImageBytesResult> {
    const result = await this.fetchImage(url, maxBytes, { referrer: context.referrer });
    if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
    return {
      ok: true,
      bytes: result.bytes,
      mimeType: result.mimeType,
      byteLength: result.byteLength,
      sha256: await this.sha256(result.bytes),
    };
  }

  private async headProbe(url: string, referrer: string | undefined, timeoutMs: number): Promise<ImageProbeResult> {
    const boundedTimeoutMs = Math.min(15_000, Math.max(1000, timeoutMs));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), boundedTimeoutMs);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, reason: 'unsupported-url', message: 'Image URL must use HTTP or HTTPS.' };
      }
      const response = await this.fetchImpl(parsed.href, {
        cache: 'no-store',
        credentials: credentialsForImageRequest(parsed.href, referrer),
        method: 'HEAD',
        signal: controller.signal,
      });
      if (!response.ok) {
        return { ok: false, status: response.status, reason: 'http-error', message: `Image probe returned ${response.status}.` };
      }
      return { ok: true, status: response.status, finalUrl: response.url || parsed.href };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, reason: 'timeout', message: 'Image probe timed out.' };
      }
      return { ok: false, reason: 'network-error', message: 'Image probe failed.' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getProbe(url: string, context: Omit<ImageRequestContext, 'intent'>, timeoutMs: number): Promise<ImageProbeResult> {
    const result = await this.withProbeTimeout(
      this.fetchBytes(url, MAX_BUFFERED_IMAGE_BYTES, { ...context, intent: 'field-speculative-probe' }),
      timeoutMs,
    );
    if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
    return { ok: true, status: 200, finalUrl: url };
  }

  private async withProbeTimeout<T extends ImageBytesResult>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T | Extract<ImageBytesResult, { readonly ok: false }>> {
    const boundedTimeoutMs = Math.min(15_000, Math.max(1000, timeoutMs));
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<Extract<ImageBytesResult, { readonly ok: false }>>((resolve) => {
          timeout = setTimeout(() => resolve({ ok: false, reason: 'timeout', message: 'Image probe timed out.' }), boundedTimeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== null) clearTimeout(timeout);
    }
  }

  private speculativeCacheKey(
    url: string,
    contextKey: string | undefined,
    probeMethod: ImageProbeMethod,
    referrer: string | undefined,
  ): string {
    return `${contextKey ?? 'global'}\n${probeMethod}\n${referrer ?? ''}\n${url}`;
  }

  private getInflightKey(url: string, maxBytes: number, referrer: string | undefined): string {
    return [String(maxBytes), referrer ?? '', url].join('\n');
  }

  private skippableFailureCacheKey(url: string, maxBytes: number, referrer: string | undefined): string {
    return this.getInflightKey(url, maxBytes, referrer);
  }

  private rememberSkippableFailure(url: string, maxBytes: number, referrer: string | undefined, reason: string, message: string): void {
    const cacheKey = this.skippableFailureCacheKey(url, maxBytes, referrer);
    this.skippableFailureCache.delete(cacheKey);
    this.skippableFailureCache.set(cacheKey, { result: { status: 'skippable-failed', reason, message }, cachedAt: this.now() });
    this.pruneSkippableFailureCache();
  }

  private completedGetCacheResult(exactKey: string, url: string, maxBytes: number, referrer: string | undefined): ImageBytesResult | null {
    const exact = this.completedGetCache.get(exactKey);
    if (exact) return cloneImageBytesResult(exact.result);
    const compatible = this.findCompletedGetCacheEntry(url, maxBytes, referrer);
    if (!compatible) return null;
    this.completedGetCache.delete(compatible.key);
    this.completedGetCache.set(compatible.key, compatible.entry);
    return cloneImageBytesResult(compatible.entry.result);
  }

  private hasCompletedGetCacheResult(url: string, maxBytes: number, referrer: string | undefined): boolean {
    return this.findCompletedGetCacheEntry(url, maxBytes, referrer) !== null;
  }

  private findCompletedGetCacheEntry(
    url: string,
    maxBytes: number,
    referrer: string | undefined,
  ): { readonly key: string; readonly entry: CompletedGetCacheEntry } | null {
    const prefix = `${referrer ?? ''}\n${url}`;
    for (const [key, entry] of this.completedGetCache) {
      if (!key.endsWith(prefix)) continue;
      if (entry.result.byteLength > maxBytes) continue;
      return { key, entry };
    }
    return null;
  }

  private rememberCompletedGet(cacheKey: string, result: Extract<ImageBytesResult, { readonly ok: true }>): void {
    const existing = this.completedGetCache.get(cacheKey);
    if (existing) {
      this.completedGetCacheBytes -= existing.cacheBytes;
      this.completedGetCache.delete(cacheKey);
    }
    const cached = cloneSuccessfulImageBytesResult(result);
    const cacheBytes = cached.byteLength;
    this.completedGetCache.set(cacheKey, { result: cached, cachedAt: this.now(), cacheBytes });
    this.completedGetCacheBytes += cacheBytes;
    this.pruneCompletedGetCache();
  }

  private pruneCompletedGetCache(): void {
    while (this.completedGetCache.size > MAX_COMPLETED_GET_CACHE_ENTRIES || this.completedGetCacheBytes > MAX_COMPLETED_GET_CACHE_BYTES) {
      const oldest = this.completedGetCache.keys().next().value;
      if (!oldest) break;
      const removed = this.completedGetCache.get(oldest);
      if (removed) this.completedGetCacheBytes -= removed.cacheBytes;
      this.completedGetCache.delete(oldest);
    }
  }

  private rememberSpeculativeProbe(cacheKey: string, result: ImageProbeResult): void {
    this.speculativeProbeCache.delete(cacheKey);
    this.speculativeProbeCache.set(cacheKey, { result, cachedAt: this.now() });
    this.pruneSpeculativeProbeCache();
  }

  private speculativeProbeCacheResult(cacheKey: string): SpeculativeProbeCacheEntry | null {
    const cached = this.speculativeProbeCache.get(cacheKey);
    if (!cached) return null;
    if (this.now() - cached.cachedAt > SPECULATIVE_CACHE_TTL_MS) {
      this.speculativeProbeCache.delete(cacheKey);
      return null;
    }
    this.speculativeProbeCache.delete(cacheKey);
    this.speculativeProbeCache.set(cacheKey, cached);
    return cached;
  }

  private skippableFailureCacheResult(cacheKey: string): (ImageRequestPolicyResult & { readonly status: 'skippable-failed' }) | null {
    const cached = this.skippableFailureCache.get(cacheKey);
    if (!cached) return null;
    if (this.now() - cached.cachedAt > SPECULATIVE_CACHE_TTL_MS) {
      this.skippableFailureCache.delete(cacheKey);
      return null;
    }
    this.skippableFailureCache.delete(cacheKey);
    this.skippableFailureCache.set(cacheKey, cached);
    return cached.result;
  }

  private pruneSpeculativeProbeCache(): void {
    this.pruneExpiredSpeculativeEntries();
    while (this.speculativeProbeCache.size > MAX_SPECULATIVE_PROBE_CACHE_ENTRIES) {
      const oldest = this.speculativeProbeCache.keys().next().value;
      if (!oldest) break;
      this.speculativeProbeCache.delete(oldest);
    }
  }

  private pruneSkippableFailureCache(): void {
    this.pruneExpiredSpeculativeEntries();
    while (this.skippableFailureCache.size > MAX_SKIPPABLE_FAILURE_CACHE_ENTRIES) {
      const oldest = this.skippableFailureCache.keys().next().value;
      if (!oldest) break;
      this.skippableFailureCache.delete(oldest);
    }
  }

  private pruneExpiredSpeculativeEntries(): void {
    const now = this.now();
    for (const [key, entry] of this.speculativeProbeCache) {
      if (now - entry.cachedAt > SPECULATIVE_CACHE_TTL_MS) this.speculativeProbeCache.delete(key);
    }
    for (const [key, entry] of this.skippableFailureCache) {
      if (now - entry.cachedAt > SPECULATIVE_CACHE_TTL_MS) this.skippableFailureCache.delete(key);
    }
  }
}

function isSpeculativeImageIntent(intent: ImageRequestIntent | undefined): boolean {
  return intent === 'field-speculative-probe' || intent === 'field-active-navigation';
}

function isSkippableProbeFailure(result: Extract<ImageProbeResult, { readonly ok: false }>): boolean {
  return result.status === 400 || result.status === 404 || result.status === 410;
}

function cloneImageBytesResult(result: ImageBytesResult): ImageBytesResult {
  if (!result.ok) return result;
  return cloneSuccessfulImageBytesResult(result);
}

function cloneSuccessfulImageBytesResult(
  result: Extract<ImageBytesResult, { readonly ok: true }>,
): Extract<ImageBytesResult, { readonly ok: true }> {
  return {
    ...result,
    bytes: result.bytes.slice(0),
  };
}

function credentialsForImageRequest(url: string, referrer: string | undefined): RequestCredentials {
  if (!referrer) return 'omit';
  try {
    return new URL(url).origin === new URL(referrer).origin ? 'include' : 'omit';
  } catch {
    return 'omit';
  }
}

function arrayBufferToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < view.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...view.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(''));
}
