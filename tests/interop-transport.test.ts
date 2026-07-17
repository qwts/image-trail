import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';

import { OverlookICloudNativeClient, OVERLOOK_ICLOUD_NATIVE_HOST } from '../extension/src/background/interop-icloud-client.js';
import {
  EncryptedInteropTransport,
  InteropTransportError,
  sha256,
  type InteropObjectPage,
  type InteropObjectStore,
} from '../extension/src/core/interop/transport.js';

const SCOPE = {
  pairingId: 'f03e92fd-ad4a-41e6-aeaf-a65abde4c853',
  transferId: '35d06972-7453-4c53-8a32-e531e4ab43ed',
};

class MemoryInteropStore implements InteropObjectStore {
  readonly provider = 'pcloud' as const;
  readonly objects = new Map<string, Uint8Array>();
  puts = 0;

  authState(): Promise<'connected'> {
    return Promise.resolve('connected');
  }
  put(path: string, bytes: Uint8Array): Promise<{ readonly bytes: number }> {
    this.puts += 1;
    this.objects.set(path, bytes.slice());
    return Promise.resolve({ bytes: bytes.byteLength });
  }
  get(path: string): Promise<Uint8Array> {
    const value = this.objects.get(path);
    if (value === undefined) return Promise.reject(new InteropTransportError('missing', 'not-found', false));
    return Promise.resolve(value.slice());
  }
  list(prefix: string, cursor: string | null): Promise<InteropObjectPage> {
    const entries = [...this.objects.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, bytes]) => ({ path, bytes: bytes.byteLength }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const offset = cursor === null ? 0 : Number(cursor);
    const page = entries.slice(offset, offset + 2);
    return Promise.resolve({ entries: page, nextCursor: offset + page.length < entries.length ? String(offset + page.length) : null });
  }
  delete(path: string): Promise<void> {
    this.objects.delete(path);
    return Promise.resolve();
  }
  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number }> {
    return Promise.resolve({ usedBytes: [...this.objects.values()].reduce((sum, value) => sum + value.byteLength, 0), totalBytes: 1024 });
  }
  async verify(path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    const value = await this.get(path);
    return { sha256: await sha256(value), bytes: value.byteLength };
  }
}

describe('encrypted interop transport (#588)', () => {
  test('resumes verified chunks, paginates, and reproduces exact ciphertext', async () => {
    const store = new MemoryInteropStore();
    const transport = new EncryptedInteropTransport(store, 3);
    const ciphertext = new TextEncoder().encode('encrypted-envelope-bytes');
    const first = await transport.upload(SCOPE, 'records/a.envelope', ciphertext);
    assert.equal(first.sha256, createHash('sha256').update(ciphertext).digest('hex'));
    const putsAfterFirst = store.puts;
    const second = await transport.upload(SCOPE, 'records/a.envelope', ciphertext);
    assert.equal(second.resumedChunks, Math.ceil(ciphertext.byteLength / 3));
    assert.equal(store.puts, putsAfterFirst + 1, 'only the manifest is refreshed after chunk verification');
    assert.deepEqual(await transport.download(SCOPE, 'records/a.envelope'), ciphertext);
    const firstPage = await transport.list(SCOPE);
    assert.equal(firstPage.entries.length, 2);
    assert.notEqual(firstPage.nextCursor, null);
    assert.deepEqual(await transport.quota(), {
      usedBytes: [...store.objects.values()].reduce((sum, value) => sum + value.byteLength, 0),
      totalBytes: 1024,
    });
  });

  test('fails closed on traversal and corrupted provider bytes', async () => {
    const store = new MemoryInteropStore();
    const transport = new EncryptedInteropTransport(store, 4);
    await assert.rejects(transport.upload(SCOPE, '../backup/file', new Uint8Array([1])), /provider-relative/u);
    await transport.upload(SCOPE, 'records/a.envelope', new Uint8Array([1, 2, 3, 4, 5]));
    const chunk = [...store.objects.keys()].find((path) => path.endsWith('00000000.bin'));
    assert.ok(chunk);
    store.objects.set(chunk, new Uint8Array([9, 9, 9, 9]));
    await assert.rejects(
      transport.download(SCOPE, 'records/a.envelope'),
      (error: unknown) => error instanceof InteropTransportError && error.code === 'corrupt',
    );
  });

  test('discovers logical encrypted objects across provider pages without exposing chunks', async () => {
    const store = new MemoryInteropStore();
    const transport = new EncryptedInteropTransport(store, 2);
    await transport.upload(SCOPE, 'messages/acknowledgements/000000000001-a.json.aesgcm', new Uint8Array([1, 2, 3]));
    await transport.upload(SCOPE, 'messages/acknowledgements/000000000002-b.json.aesgcm', new Uint8Array([4, 5, 6]));
    assert.deepEqual(await transport.listPaths(SCOPE, 'messages/acknowledgements'), [
      'messages/acknowledgements/000000000001-a.json.aesgcm',
      'messages/acknowledgements/000000000002-b.json.aesgcm',
    ]);
  });
});

describe('signed iCloud native client (#588)', () => {
  test('restricts platform, extension identity, host, and bounded control-only frames', async () => {
    const messages: Array<{ host: string; message: object }> = [];
    const runtime = {
      id: 'released-extension-id',
      getPlatformInfo: () => Promise.resolve({ os: 'mac' as const, arch: 'arm64' as const, nacl_arch: 'arm' as const }),
      sendNativeMessage: (host: string, message: object) => {
        messages.push({ host, message });
        return Promise.resolve({ schemaVersion: 1, ok: true, result: { available: true } });
      },
    };
    const client = new OverlookICloudNativeClient('released-extension-id', runtime);
    assert.deepEqual(await client.request({ operation: 'status' }), { available: true });
    assert.equal(messages[0]?.host, OVERLOOK_ICLOUD_NATIVE_HOST);
    assert.equal(JSON.stringify(messages[0]?.message).includes('bytes'), false);

    await assert.rejects(new OverlookICloudNativeClient('other-id', runtime).request({ operation: 'status' }), /identity/u);
    await assert.rejects(
      new OverlookICloudNativeClient('released-extension-id', {
        ...runtime,
        getPlatformInfo: () => Promise.resolve({ os: 'win' as const, arch: 'x86-64' as const, nacl_arch: 'x86-64' as const }),
      }).request({ operation: 'status' }),
      /requires macOS/u,
    );
  });
});
