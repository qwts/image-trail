import test from 'node:test';
import assert from 'node:assert/strict';

import { createDownloadImageResultMessage } from '../../extension/src/background/messages.js';
import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelState } from '../../extension/src/core/types.js';
import { CurrentImageDownloadController } from '../../extension/src/ui/panel/current-image-download-controller.js';

const DATA_IMAGE = 'data:image/png;base64,aW1hZ2UtdHJhaWw=';

test('current-image download resolves the real data URL from the selected image element', async () => {
  const originalChrome = globalThis.chrome;
  const messages: unknown[] = [];
  globalThis.chrome = {
    runtime: {
      id: 'test-extension',
      sendMessage: async (message: unknown) => {
        messages.push(message);
        return createDownloadImageResultMessage({ ok: true, downloadId: 7 });
      },
    },
  } as unknown as typeof chrome;
  const image = document.createElement('img');
  image.src = DATA_IMAGE;
  let state: PanelState = {
    ...createInitialPanelState(0),
    target: { ...createInitialPanelState(0).target, selectedHandleId: 'data-target', selectedUrl: 'data:' },
  };
  const controller = new CurrentImageDownloadController({
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => undefined,
    findSelectedImage: () => image,
  });

  try {
    assert.equal(await controller.download(false), true);
  } finally {
    globalThis.chrome = originalChrome;
  }

  const message = messages[0] as { readonly payload: { readonly url: string; readonly fileName: string } };
  assert.equal(message.payload.url, DATA_IMAGE);
  assert.equal(message.payload.fileName, 'image-trail-image.png');
  assert.equal(state.importExportBusy, false);
});
