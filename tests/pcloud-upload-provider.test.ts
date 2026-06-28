import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { downloadPCloudBackup, listPCloudBackups, uploadPCloudBackup } from '../extension/src/background/pcloud-provider.js';

const CONNECTION_KEY = 'imageTrail.pcloudConnection';

interface FetchCall {
  readonly url: string;
  readonly init?: RequestInit;
  readonly body?: BodyInit | null;
}

function jsonResponse(body: Record<string, unknown>, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'content-type': 'application/json' },
  });
}

function isApiPCloudCall(call: FetchCall): boolean {
  return new URL(call.url).hostname === 'api.pcloud.com';
}

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function mockedFolderId(init: RequestInit | undefined): number {
  const params = init?.body as URLSearchParams;
  const parentFolderId = params.get('folderid');
  const name = params.get('name');
  if (parentFolderId === '0' && name === 'Image Trail') return 100;
  if (parentFolderId === '100' && name === 'backups') return 200;
  throw new Error(`Unexpected folder creation parent=${parentFolderId ?? ''} name=${name ?? ''}`);
}

function installPCloudConnection(options: { readonly dnrCalls?: unknown[] } = {}): () => void {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      local: {
        setAccessLevel: async function (this: chrome.storage.StorageArea) {
          assert.equal(this, chrome.storage.local);
        },
        get: async () => ({
          [CONNECTION_KEY]: {
            schemaVersion: 1,
            provider: 'pcloud',
            accessToken: 'token-secret',
            apiHost: 'api.pcloud.com',
            connectedAt: '2026-06-27T00:00:00.000Z',
          },
        }),
      },
    },
    declarativeNetRequest: options.dnrCalls
      ? {
          RuleActionType: {
            MODIFY_HEADERS: 'modifyHeaders',
          },
          HeaderOperation: {
            SET: 'set',
          },
          ResourceType: {
            XMLHTTPREQUEST: 'xmlhttprequest',
          },
          updateSessionRules: async (input: unknown) => {
            options.dnrCalls?.push(input);
          },
        }
      : undefined,
  } as unknown as typeof chrome;

  return () => {
    globalThis.chrome = originalChrome;
  };
}

test('uploadPCloudBackup creates folders, uploads, retries listfolder, and verifies downloaded bytes', async () => {
  const restoreChrome = installPCloudConnection();
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  let listAttempts = 0;
  const encryptedContent = '{"encrypted":true}';

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init, body: init?.body });

    if (url.endsWith('/createfolderifnotexists')) {
      return jsonResponse({
        result: '0',
        metadata: {
          isfolder: true,
          folderid: String(mockedFolderId(init)),
        },
      });
    }
    if (url.endsWith('/uploadfile')) {
      const form = init?.body as FormData;
      assert.equal(form.get('access_token'), 'token-secret');
      assert.equal(form.get('folderid'), '200');
      assert.equal(form.get('nopartial'), '1');
      assert.equal(form.get('renameifexists'), '1');
      return jsonResponse({
        result: '0',
        metadata: [{ fileid: '300', size: String(encryptedContent.length), name: 'backup.json' }],
      });
    }
    if (url.endsWith('/listfolder')) {
      listAttempts += 1;
      return jsonResponse({
        result: '0',
        metadata: { contents: listAttempts === 1 ? [] : [{ fileid: '300' }] },
      });
    }
    if (url.endsWith('/getfilelink')) {
      return jsonResponse({ result: '0', hosts: ['c123.pcloud.com'], path: '/verified-backup' });
    }
    if (url === 'https://c123.pcloud.com/verified-backup') {
      return new Response(encryptedContent);
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const result = await uploadPCloudBackup({ fileName: 'backup.json', fileContent: encryptedContent });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fileId, 300);
      assert.equal(result.fileName, 'backup.json');
      assert.equal(result.folderPath, '/Image Trail/backups');
      assert.equal(result.apiHost, 'api.pcloud.com');
      assert.equal(result.sizeBytes, encryptedContent.length);
      assert.match(result.sha256, /^[a-f0-9]{64}$/u);
    }
    assert.equal(listAttempts, 2);
    assert.deepEqual(
      calls.filter(isApiPCloudCall).map((call) => new URL(call.url).pathname.slice(1)),
      ['createfolderifnotexists', 'createfolderifnotexists', 'uploadfile', 'listfolder', 'listfolder', 'getfilelink'],
    );
    assert.equal(JSON.stringify(result).includes('token-secret'), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test('uploadPCloudBackup deletes unverified files after verification mismatch', async () => {
  const restoreChrome = installPCloudConnection();
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init, body: init?.body });

    if (url.endsWith('/createfolderifnotexists')) {
      return jsonResponse({ result: 0, metadata: { isfolder: true, folderid: mockedFolderId(init) } });
    }
    if (url.endsWith('/uploadfile')) {
      const form = init?.body as FormData;
      assert.equal(form.get('folderid'), '200');
      return jsonResponse({ result: 0, metadata: [{ fileid: 301, size: 18, name: 'backup.json' }] });
    }
    if (url.endsWith('/listfolder')) {
      return jsonResponse({ result: 0, metadata: { contents: [{ fileid: 301 }] } });
    }
    if (url.endsWith('/getfilelink')) {
      return jsonResponse({ result: 0, hosts: ['c123.pcloud.com'], path: '/mismatched-backup' });
    }
    if (url === 'https://c123.pcloud.com/mismatched-backup') {
      return new Response('different bytes');
    }
    if (url.endsWith('/deletefile')) {
      const params = init?.body as URLSearchParams;
      assert.equal(params.get('fileid'), '301');
      return jsonResponse({ result: '0' });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const result = await uploadPCloudBackup({ fileName: 'backup.json', fileContent: '{"encrypted":true}' });

    assert.equal(result.ok, false);
    assert.equal(result.cleanupFileId, 301);
    assert.equal(result.cleanupNeeded, false);
    assert.match(result.message, /unverified pCloud file was deleted/u);
    assert.equal(
      calls.some((call) => call.url.endsWith('/deletefile')),
      true,
    );
    assert.equal(JSON.stringify(result).includes('token-secret'), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test('uploadPCloudBackup falls back to checksum verification when pCloud rejects direct-link referrers', async () => {
  const restoreChrome = installPCloudConnection();
  const originalFetch = globalThis.fetch;
  const encryptedContent = '{"encrypted":true}';
  const calls: FetchCall[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init, body: init?.body });

    if (url.endsWith('/createfolderifnotexists')) {
      return jsonResponse({ result: 0, metadata: { isfolder: true, folderid: mockedFolderId(init) } });
    }
    if (url.endsWith('/uploadfile')) {
      const form = init?.body as FormData;
      assert.equal(form.get('folderid'), '200');
      return jsonResponse({ result: 0, metadata: [{ fileid: 303, size: encryptedContent.length, name: 'backup.json' }] });
    }
    if (url.endsWith('/listfolder')) {
      return jsonResponse({ result: 0, metadata: { contents: [{ fileid: 303 }] } });
    }
    if (url.endsWith('/getfilelink')) {
      return jsonResponse({ result: 0, hosts: ['c123.pcloud.com'], path: '/referrer-blocked-backup' });
    }
    if (url === 'https://c123.pcloud.com/referrer-blocked-backup') {
      return new Response('Invalid link referer.', { status: 400 });
    }
    if (url.endsWith('/checksumfile')) {
      const params = init?.body as URLSearchParams;
      assert.equal(params.get('fileid'), '303');
      return jsonResponse({ result: 0, sha1: sha1(encryptedContent) });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const result = await uploadPCloudBackup({ fileName: 'backup.json', fileContent: encryptedContent });

    assert.equal(result.ok, true);
    assert.match(result.message, /with pCloud checksum/u);
    assert.equal(
      calls.some((call) => call.url.endsWith('/deletefile')),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test('uploadPCloudBackup reports cleanup needed when deleting an unverified file fails', async () => {
  const restoreChrome = installPCloudConnection();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/createfolderifnotexists'))
      return jsonResponse({ result: 0, metadata: { isfolder: true, folderid: mockedFolderId(init) } });
    if (url.endsWith('/uploadfile')) {
      const form = init?.body as FormData;
      assert.equal(form.get('folderid'), '200');
      return jsonResponse({ result: 0, metadata: [{ fileid: 302, size: 18, name: 'backup.json' }] });
    }
    if (url.endsWith('/listfolder')) return jsonResponse({ result: 0, metadata: { contents: [{ fileid: 302 }] } });
    if (url.endsWith('/getfilelink')) return jsonResponse({ result: 0, hosts: ['c123.pcloud.com'], path: '/mismatched-backup' });
    if (url === 'https://c123.pcloud.com/mismatched-backup') return new Response('different bytes');
    if (url.endsWith('/deletefile')) return jsonResponse({ result: 5000, error: 'Delete failed.' });
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const result = await uploadPCloudBackup({ fileName: 'backup.json', fileContent: '{"encrypted":true}' });

    assert.equal(result.ok, false);
    assert.equal(result.cleanupFileId, 302);
    assert.equal(result.cleanupNeeded, true);
    assert.match(result.message, /Cleanup needed: delete pCloud fileid 302/u);
  } finally {
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test('listPCloudBackups returns encrypted backup candidates newest first without tokens', async () => {
  const restoreChrome = installPCloudConnection();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/createfolderifnotexists')) {
      return jsonResponse({ result: 0, metadata: { isfolder: true, folderid: mockedFolderId(init) } });
    }
    if (url.endsWith('/listfolder')) {
      return jsonResponse({
        result: 0,
        metadata: {
          contents: [
            { fileid: 400, name: 'notes.txt', size: 12, modified: 'Sat, 27 Jun 2026 00:00:00 +0000' },
            {
              fileid: 401,
              name: 'image-trail-pcloud-backup-2026-06-26T00-00-00Z.image-trail-encrypted.json',
              size: 128,
              modified: 'Fri, 26 Jun 2026 00:00:00 +0000',
              sha1: 'a'.repeat(40),
            },
            {
              fileid: 402,
              name: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
              size: 256,
              modified: 'Sat, 27 Jun 2026 00:00:00 +0000',
              sha1: 'b'.repeat(40),
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const result = await listPCloudBackups();

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.folderPath, '/Image Trail/backups');
      assert.equal(result.candidates.length, 2);
      assert.equal(result.candidates[0]?.fileId, 402);
      assert.equal(result.candidates[1]?.fileId, 401);
      assert.match(result.message, /Found 2 encrypted pCloud backups/u);
    }
    assert.equal(JSON.stringify(result).includes('token-secret'), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test('downloadPCloudBackup downloads encrypted JSON and reports local SHA-256 without tokens', async () => {
  const dnrCalls: unknown[] = [];
  const restoreChrome = installPCloudConnection({ dnrCalls });
  const originalFetch = globalThis.fetch;
  const fileContent = '{"encrypted":true,"payload":"restore"}';

  const calls: FetchCall[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init, body: init?.body });
    if (url.endsWith('/getfilelink')) {
      const params = init?.body as URLSearchParams;
      assert.equal(params.get('fileid'), '402');
      return jsonResponse({ result: 0, hosts: ['c123.pcloud.com'], path: '/restore-backup' });
    }
    if (url === 'https://c123.pcloud.com/restore-backup') {
      assert.equal(init?.referrer, 'https://my.pcloud.com/');
      assert.equal(init?.referrerPolicy, 'origin');
      return new Response(fileContent);
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const result = await downloadPCloudBackup({
      fileId: 402,
      fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fileContent, fileContent);
      assert.equal(result.sizeBytes, fileContent.length);
      assert.equal(result.sha256, sha256(fileContent));
      assert.equal(result.folderPath, '/Image Trail/backups');
    }
    assert.equal(JSON.stringify(result).includes('token-secret'), false);
    assert.equal(
      calls.some((call) => call.url === 'https://c123.pcloud.com/restore-backup'),
      true,
    );
    assert.equal(JSON.stringify(dnrCalls).includes('"header":"Referer"'), true);
    assert.equal(JSON.stringify(dnrCalls).includes('"value":"https://my.pcloud.com/"'), true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});

test('downloadPCloudBackup retries alternate pCloud hosts after direct-link referrer rejection', async () => {
  const dnrCalls: unknown[] = [];
  const restoreChrome = installPCloudConnection({ dnrCalls });
  const originalFetch = globalThis.fetch;
  const fileContent = '{"encrypted":true,"payload":"restore"}';
  const calls: FetchCall[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init, body: init?.body });
    if (url.endsWith('/getfilelink')) {
      const params = init?.body as URLSearchParams;
      assert.equal(params.get('fileid'), '402');
      return jsonResponse({ result: 0, hosts: ['blocked.pcloud.com', 'c123.pcloud.com'], path: '/restore-backup' });
    }
    if (url === 'https://blocked.pcloud.com/restore-backup') {
      assert.equal(init?.referrer, 'https://my.pcloud.com/');
      assert.equal(init?.referrerPolicy, 'origin');
      return new Response('Invalid link referer.', { status: 400 });
    }
    if (url === 'https://c123.pcloud.com/restore-backup') {
      assert.equal(init?.referrer, 'https://my.pcloud.com/');
      assert.equal(init?.referrerPolicy, 'origin');
      return new Response(fileContent);
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const result = await downloadPCloudBackup({
      fileId: 402,
      fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fileContent, fileContent);
      assert.equal(result.sha256, sha256(fileContent));
    }
    assert.deepEqual(
      calls.filter((call) => !isApiPCloudCall(call)).map((call) => call.url),
      ['https://blocked.pcloud.com/restore-backup', 'https://c123.pcloud.com/restore-backup'],
    );
    assert.equal(JSON.stringify(result).includes('token-secret'), false);
    assert.equal(JSON.stringify(dnrCalls).includes('"header":"Referer"'), true);
    assert.equal(JSON.stringify(dnrCalls).includes('"value":"https://my.pcloud.com/"'), true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreChrome();
  }
});
