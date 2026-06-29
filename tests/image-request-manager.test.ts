import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageRequestManager } from '../extension/src/background/image-request-manager.js';

test('field speculative probes use HEAD and cache by context', async () => {
  const calls: RequestInit[] = [];
  const manager = new ImageRequestManager({
    fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(null, { status: 204 });
    },
  });

  const first = await manager.probeSpeculativeImage('https://example.test/image-1.jpg', {
    referrer: 'https://example.test/page',
    timeoutMs: 2000,
    contextKey: 'run-1',
    probeMethod: 'head',
  });
  const second = await manager.probeSpeculativeImage('https://example.test/image-1.jpg', {
    referrer: 'https://example.test/page',
    timeoutMs: 2000,
    contextKey: 'run-1',
    probeMethod: 'head',
  });

  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, 'HEAD');
  assert.equal(calls[0]?.credentials, 'include');
});

test('field speculative probes default to GET and warm completed image cache', async () => {
  let headCalls = 0;
  let getCalls = 0;
  const manager = new ImageRequestManager({
    fetch: async () => {
      headCalls += 1;
      return new Response(null, { status: 204 });
    },
    fetchImage: async () => {
      getCalls += 1;
      return {
        ok: true,
        bytes: new Uint8Array([1, 2, 3]).buffer,
        mimeType: 'image/png',
        byteLength: 3,
      };
    },
    sha256: async () => 'abc123',
  });

  const probe = await manager.probeSpeculativeImage('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    timeoutMs: 2000,
    contextKey: 'run-1',
  });
  const materialized = await manager.fetchBufferedImage('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    intent: 'field-active-navigation',
    contextKey: 'run-1',
  });

  assert.equal(probe.ok, true);
  assert.equal(materialized.ok, true);
  assert.equal(headCalls, 0);
  assert.equal(getCalls, 1);
  assert.equal(materialized.ok ? materialized.sha256 : null, 'abc123');
});

test('speculative probe cache separates HEAD probes from GET probes', async () => {
  let headCalls = 0;
  let getCalls = 0;
  const manager = new ImageRequestManager({
    fetch: async () => {
      headCalls += 1;
      return new Response(null, { status: 204 });
    },
    fetchImage: async () => {
      getCalls += 1;
      return {
        ok: true,
        bytes: new Uint8Array([1, 2, 3]).buffer,
        mimeType: 'image/png',
        byteLength: 3,
      };
    },
    sha256: async () => 'abc123',
  });

  const head = await manager.probeSpeculativeImage('https://cdn.example.test/image.png', {
    timeoutMs: 2000,
    contextKey: 'run-1',
    probeMethod: 'head',
  });
  const get = await manager.probeSpeculativeImage('https://cdn.example.test/image.png', {
    timeoutMs: 2000,
    contextKey: 'run-1',
  });

  assert.equal(head.ok, true);
  assert.equal(get.ok, true);
  assert.equal(headCalls, 1);
  assert.equal(getCalls, 1);
});

test('explicit buffered GET is not poisoned by speculative probe failure', async () => {
  const manager = new ImageRequestManager({
    fetch: async () => new Response(null, { status: 404 }),
    fetchImage: async () => ({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'image/png',
      byteLength: 3,
    }),
    sha256: async () => 'abc123',
  });

  const probe = await manager.probeSpeculativeImage('https://cdn.example.test/missing.png', {
    timeoutMs: 2000,
    contextKey: 'run-1',
    probeMethod: 'head',
  });
  const explicit = await manager.fetchBufferedImage('https://cdn.example.test/missing.png', {
    contextKey: 'run-1',
  });

  assert.equal(probe.ok, false);
  assert.equal(probe.status, 404);
  assert.equal(explicit.ok, true);
  assert.equal(explicit.ok ? explicit.sha256 : null, 'abc123');
});

test('default GET probe failures are skippable only for speculative intents', async () => {
  let calls = 0;
  const manager = new ImageRequestManager({
    fetchImage: async () => {
      calls += 1;
      return { ok: false, reason: 'network-error', message: 'Image fetch returned 404.' };
    },
  });

  const probe = await manager.probeSpeculativeImage('https://cdn.example.test/missing-get.png', {
    timeoutMs: 2000,
    contextKey: 'run-1',
  });
  const speculative = manager.checkRequestPolicy('https://cdn.example.test/missing-get.png', {
    intent: 'field-active-navigation',
    contextKey: 'run-1',
  });
  const explicit = manager.checkRequestPolicy('https://cdn.example.test/missing-get.png', {
    intent: 'bookmark-load',
    contextKey: 'run-1',
  });

  assert.equal(probe.ok, false);
  assert.equal(speculative.status, 'skippable-failed');
  assert.equal(explicit.status, 'unknown');
  assert.equal(calls, 1);
});

test('compatible GET requests for the same image share one inflight fetch', async () => {
  let calls = 0;
  let releaseFetch!: () => void;
  const fetchStarted = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  const manager = new ImageRequestManager({
    fetchImage: async () => {
      calls += 1;
      await fetchStarted;
      return {
        ok: true,
        bytes: new Uint8Array([1, 2, 3]).buffer,
        mimeType: 'image/png',
        byteLength: 3,
      };
    },
    sha256: async () => 'abc123',
  });

  const first = manager.fetchBufferedImage('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    contextKey: 'run-1',
  });
  const second = manager.fetchBufferedImage('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    contextKey: 'run-2',
  });
  await Promise.resolve();
  releaseFetch();

  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.deepEqual(secondResult, firstResult);
});

test('successful buffered GET is reused by later same-url buffered GET', async () => {
  let calls = 0;
  const manager = new ImageRequestManager({
    fetchImage: async () => {
      calls += 1;
      return {
        ok: true,
        bytes: new Uint8Array([1, 2, 3]).buffer,
        mimeType: 'image/png',
        byteLength: 3,
      };
    },
    sha256: async () => 'abc123',
  });

  const first = await manager.fetchBufferedImage('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    contextKey: 'run-1',
  });
  const second = await manager.fetchBufferedImage('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    contextKey: 'run-2',
  });

  assert.equal(calls, 1);
  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
});

test('completed parsed-field GET suppresses later speculative HEAD policy', async () => {
  const manager = new ImageRequestManager({
    fetchImage: async () => ({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'image/png',
      byteLength: 3,
    }),
    sha256: async () => 'abc123',
  });

  const fetched = await manager.fetchBufferedImage('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    intent: 'field-active-navigation',
  });
  const speculative = manager.checkRequestPolicy('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    intent: 'field-speculative-probe',
  });
  const explicit = manager.checkRequestPolicy('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    intent: 'bookmark-load',
  });

  assert.equal(fetched.ok, true);
  assert.equal(speculative.status, 'cached-success');
  assert.equal(explicit.status, 'unknown');
});

test('completed thumbnail GET can satisfy later compatible buffered GET', async () => {
  const maxBytes: number[] = [];
  const manager = new ImageRequestManager({
    fetchImage: async (_url, maxBytesArg) => {
      maxBytes.push(maxBytesArg ?? -1);
      return {
        ok: true,
        bytes: new Uint8Array([1, 2, 3]).buffer,
        mimeType: 'image/png',
        byteLength: 3,
      };
    },
    sha256: async () => 'abc123',
  });

  const thumbnail = await manager.fetchThumbnail('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    intent: 'thumbnail-refresh',
  });
  const buffered = await manager.fetchBufferedImage('https://cdn.example.test/image.png', {
    referrer: 'https://example.test/page',
    intent: 'field-active-navigation',
  });

  assert.equal(thumbnail.ok, true);
  assert.equal(buffered.ok, true);
  assert.equal(maxBytes.length, 1);
});

test('GET inflight de-dupe keeps different byte profiles independent', async () => {
  const maxBytes: number[] = [];
  const manager = new ImageRequestManager({
    fetchImage: async (_url, maxBytesArg) => {
      maxBytes.push(maxBytesArg ?? -1);
      return {
        ok: true,
        bytes: new Uint8Array([1, 2, 3]).buffer,
        mimeType: 'image/png',
        byteLength: 3,
      };
    },
    sha256: async () => 'abc123',
  });

  const [thumbnail, buffered] = await Promise.all([
    manager.fetchThumbnail('https://cdn.example.test/image.png', { referrer: 'https://example.test/page' }),
    manager.fetchBufferedImage('https://cdn.example.test/image.png', { referrer: 'https://example.test/page' }),
  ]);

  assert.equal(thumbnail.ok, true);
  assert.equal(buffered.ok, true);
  assert.equal(maxBytes.length, 2);
});

test('failed GET is not cached as a permanent blocker', async () => {
  let calls = 0;
  const manager = new ImageRequestManager({
    fetchImage: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, reason: 'network-error', message: 'Image failed.' };
      return {
        ok: true,
        bytes: new Uint8Array([1, 2, 3]).buffer,
        mimeType: 'image/png',
        byteLength: 3,
      };
    },
    sha256: async () => 'abc123',
  });

  const failed = await manager.fetchBufferedImage('https://cdn.example.test/flaky.png', {
    referrer: 'https://example.test/page',
  });
  const retried = await manager.fetchBufferedImage('https://cdn.example.test/flaky.png', {
    referrer: 'https://example.test/page',
  });

  assert.equal(failed.ok, false);
  assert.equal(retried.ok, true);
  assert.equal(calls, 2);
});

test('field-active-navigation failure records skippable policy for matching parsed-field byte profile only', async () => {
  let calls = 0;
  const manager = new ImageRequestManager({
    fetchImage: async () => {
      calls += 1;
      return { ok: false, reason: 'network-error', message: 'HTTP 404 Not Found' };
    },
  });

  const failed = await manager.fetchThumbnail('https://cdn.example.test/missing.png', {
    intent: 'field-active-navigation',
    contextKey: 'field-session',
  });
  const bufferedPolicy = manager.checkRequestPolicy('https://cdn.example.test/missing.png', {
    intent: 'field-active-navigation',
    contextKey: 'field-session',
  });
  const explicit = manager.checkRequestPolicy('https://cdn.example.test/missing.png', {
    intent: 'url-editor-apply',
    contextKey: 'field-session',
  });

  assert.equal(failed.ok, false);
  assert.equal(bufferedPolicy.status, 'unknown');
  assert.equal(explicit.status, 'unknown');
  const skipped = await manager.fetchThumbnail('https://cdn.example.test/missing.png', {
    intent: 'field-active-navigation',
    contextKey: 'field-session',
  });
  assert.equal(skipped.ok, false);
  assert.equal(calls, 1);
});

test('field-active-navigation failure records skippable policy for matching referrer only', async () => {
  let calls = 0;
  const manager = new ImageRequestManager({
    fetchImage: async () => {
      calls += 1;
      return { ok: false, reason: 'network-error', message: 'HTTP 404 Not Found' };
    },
  });

  const failed = await manager.fetchBufferedImage('https://cdn.example.test/missing.png', {
    referrer: 'https://first.example.test/page',
    intent: 'field-active-navigation',
    contextKey: 'field-session',
  });
  const matchingReferrer = manager.checkRequestPolicy('https://cdn.example.test/missing.png', {
    referrer: 'https://first.example.test/page',
    intent: 'field-active-navigation',
    contextKey: 'field-session',
  });
  const differentReferrer = manager.checkRequestPolicy('https://cdn.example.test/missing.png', {
    referrer: 'https://second.example.test/page',
    intent: 'field-active-navigation',
    contextKey: 'field-session',
  });

  assert.equal(failed.ok, false);
  assert.equal(matchingReferrer.status, 'skippable-failed');
  assert.equal(differentReferrer.status, 'unknown');
  assert.equal(calls, 1);
});

test('speculative HEAD 404 records skippable policy without poisoning explicit intents', async () => {
  const manager = new ImageRequestManager({
    fetch: async () => new Response(null, { status: 404 }),
  });

  const probe = await manager.probeSpeculativeImage('https://cdn.example.test/missing-head.png', {
    timeoutMs: 2000,
    contextKey: 'field-session',
    probeMethod: 'head',
  });
  const speculative = manager.checkRequestPolicy('https://cdn.example.test/missing-head.png', {
    intent: 'field-speculative-probe',
    contextKey: 'field-session',
  });
  const bookmark = manager.checkRequestPolicy('https://cdn.example.test/missing-head.png', {
    intent: 'bookmark-load',
    contextKey: 'field-session',
  });

  assert.equal(probe.ok, false);
  assert.equal(speculative.status, 'skippable-failed');
  assert.equal(bookmark.status, 'unknown');
});

test('speculative probe cache is separated by parsed-field context', async () => {
  let status = 404;
  const calls: RequestInit[] = [];
  const manager = new ImageRequestManager({
    fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(null, { status });
    },
  });

  const stale = await manager.probeSpeculativeImage('https://example.test/image-2.jpg', {
    timeoutMs: 2000,
    contextKey: 'split-before',
    probeMethod: 'head',
  });
  status = 204;
  const current = await manager.probeSpeculativeImage('https://example.test/image-2.jpg', {
    timeoutMs: 2000,
    contextKey: 'split-after',
    probeMethod: 'head',
  });

  assert.equal(stale.ok, false);
  assert.equal(current.ok, true);
  assert.equal(calls.length, 2);
});

test('speculative timeout is cached as a failed probe result', async () => {
  let calls = 0;
  const manager = new ImageRequestManager({
    fetch: async () => {
      calls += 1;
      throw new DOMException('timeout', 'AbortError');
    },
  });

  const first = await manager.probeSpeculativeImage('https://example.test/slow.jpg', {
    timeoutMs: 1000,
    contextKey: 'run-1',
    probeMethod: 'head',
  });
  const second = await manager.probeSpeculativeImage('https://example.test/slow.jpg', {
    timeoutMs: 1000,
    contextKey: 'run-1',
    probeMethod: 'head',
  });

  assert.equal(first.ok, false);
  assert.equal(first.ok ? null : first.reason, 'timeout');
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test('default GET probe honors timeout and releases speculative callers', async () => {
  const manager = new ImageRequestManager({
    fetchImage: async () => new Promise(() => undefined),
  });

  const startedAt = Date.now();
  const result = await manager.probeSpeculativeImage('https://example.test/slow-get.jpg', {
    timeoutMs: 1000,
    contextKey: 'run-1',
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.reason, 'timeout');
  assert.ok(Date.now() - startedAt < 3000);
});

test('speculative failure policy expires from session cache', async () => {
  let now = 0;
  let calls = 0;
  const manager = new ImageRequestManager({
    now: () => now,
    fetchImage: async () => {
      calls += 1;
      return { ok: false, reason: 'network-error', message: 'HTTP 404 Not Found' };
    },
  });

  const failed = await manager.fetchBufferedImage('https://cdn.example.test/transient.png', {
    intent: 'field-active-navigation',
  });
  const cached = manager.checkRequestPolicy('https://cdn.example.test/transient.png', {
    intent: 'field-active-navigation',
  });
  now = 6 * 60 * 1000;
  const expired = manager.checkRequestPolicy('https://cdn.example.test/transient.png', {
    intent: 'field-active-navigation',
  });

  assert.equal(failed.ok, false);
  assert.equal(cached.status, 'skippable-failed');
  assert.equal(expired.status, 'unknown');
  assert.equal(calls, 1);
});
