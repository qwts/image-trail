import test from 'node:test';
import assert from 'node:assert/strict';
import * as compatibilityBarrel from '../extension/src/background/messages.js';
import * as blobMessages from '../extension/src/background/messages/blob-messages.js';
import * as bookmarkMessages from '../extension/src/background/messages/bookmark-messages.js';
import * as commonMessages from '../extension/src/background/messages/common.js';
import * as imageFetchMessages from '../extension/src/background/messages/image-fetch-messages.js';
import * as panelMessages from '../extension/src/background/messages/panel-messages.js';
import * as pcloudMessages from '../extension/src/background/messages/pcloud-messages.js';
import * as recallMessages from '../extension/src/background/messages/recall-messages.js';
import * as urlTemplateMessages from '../extension/src/background/messages/url-template-messages.js';
import type { ExtensionRequest, ExtensionResponse } from '../extension/src/background/messages.js';
import type { BlobRequest, BlobResponse } from '../extension/src/background/messages/blob-messages.js';
import type { BookmarkRequest, BookmarkResponse } from '../extension/src/background/messages/bookmark-messages.js';
import type { CommonRequest, CommonResponse } from '../extension/src/background/messages/common.js';
import type { ImageFetchRequest, ImageFetchResponse } from '../extension/src/background/messages/image-fetch-messages.js';
import type { PanelRequest, PanelResponse } from '../extension/src/background/messages/panel-messages.js';
import type { PCloudRequest, PCloudResponse } from '../extension/src/background/messages/pcloud-messages.js';
import type { RecallRequest, RecallResponse } from '../extension/src/background/messages/recall-messages.js';
import type { UrlTemplateRequest, UrlTemplateResponse } from '../extension/src/background/messages/url-template-messages.js';

type ExtractedRequest =
  BlobRequest | BookmarkRequest | CommonRequest | ImageFetchRequest | PanelRequest | PCloudRequest | RecallRequest | UrlTemplateRequest;

type ExtractedResponse =
  | BlobResponse
  | BookmarkResponse
  | CommonResponse
  | ImageFetchResponse
  | PanelResponse
  | PCloudResponse
  | RecallResponse
  | UrlTemplateResponse;

const domains = {
  blob: blobMessages,
  bookmark: bookmarkMessages,
  common: commonMessages,
  imageFetch: imageFetchMessages,
  panel: panelMessages,
  pcloud: pcloudMessages,
  recall: recallMessages,
  urlTemplate: urlTemplateMessages,
};

test('domain message unions remain assignable to the compatibility unions', () => {
  const compileTimeCompatibility: readonly [
    ExtractedRequest extends ExtensionRequest ? true : false,
    ExtractedResponse extends ExtensionResponse ? true : false,
  ] = [true, true];

  assert.deepEqual(compileTimeCompatibility, [true, true]);
});

for (const [domainName, domain] of Object.entries(domains)) {
  test(`${domainName} creators remain available through the compatibility barrel`, () => {
    const domainExports = domain as Record<string, unknown>;
    const barrelExports = compatibilityBarrel as Record<string, unknown>;
    const creatorNames = Object.keys(domainExports).filter((name) => name.startsWith('create'));

    assert.ok(creatorNames.length > 0);
    for (const creatorName of creatorNames) {
      assert.equal(barrelExports[creatorName], domainExports[creatorName], creatorName);
    }
  });
}
