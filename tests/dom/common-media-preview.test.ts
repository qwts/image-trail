import assert from 'node:assert/strict';
import test from 'node:test';

import type { CommonMediaInfo } from '../../extension/src/core/media/common-media-types.js';
import { createCommonMediaPreviewSurface } from '../../extension/src/preview/common-media-preview.js';

const mp4Info: CommonMediaInfo = {
  kind: 'common-media',
  mediaKind: 'video',
  animated: false,
  frameCount: null,
  loopCount: null,
  container: 'ISO-BMFF',
  streams: [
    {
      type: 'video',
      codec: 'H.264',
      profile: 'Baseline',
      level: '3.0',
      bitDepth: 8,
      channels: null,
      sampleRate: null,
      language: null,
    },
    {
      type: 'audio',
      codec: 'AAC',
      profile: 'LC',
      level: null,
      bitDepth: null,
      channels: 1,
      sampleRate: 48_000,
      language: null,
    },
  ],
  durationSeconds: 1,
  codedWidth: 64,
  codedHeight: 48,
  displayWidth: 64,
  displayHeight: 48,
  rotationDegrees: 0,
  frameRate: 15,
  variableFrameRate: false,
  audioPresent: true,
  hdr: false,
  colorTransfer: 'BT.709',
  probeIncomplete: false,
};

test('native common-media preview uses a bounded blob URL, controls, and no autoplay', (t) => {
  const originalCanPlayType = HTMLMediaElement.prototype.canPlayType;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const revoked: string[] = [];
  HTMLMediaElement.prototype.canPlayType = () => 'probably';
  URL.createObjectURL = () => 'blob:image-trail/common-media';
  URL.revokeObjectURL = (url) => revoked.push(url);
  t.after(() => {
    HTMLMediaElement.prototype.canPlayType = originalCanPlayType;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  const surface = createCommonMediaPreviewSurface(document, {
    dataUrl: 'data:video/mp4;base64,AAAA',
    mediaInfo: mp4Info,
  });
  const video = surface.querySelector('video');
  assert.ok(video);
  assert.equal(video.controls, true);
  assert.equal(video.autoplay, false);
  assert.equal(video.preload, 'metadata');
  assert.equal(video.getAttribute('aria-label'), 'Decrypted MP4 original');
  assert.equal(video.src, 'blob:image-trail/common-media');
  assert.match(surface.textContent ?? '', /Preparing bounded MP4 playback/u);

  video.dispatchEvent(new Event('loadedmetadata'));
  assert.match(surface.textContent ?? '', /MP4 ready \(H\.264 \+ AAC\); duration 0:01\. Playback is paused\./u);
  window.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(revoked, ['blob:image-trail/common-media']);
});

test('preserved-only and malformed common media never create an active playback element', () => {
  const matroskaInfo = { ...mp4Info, container: 'Matroska' as const };
  const preserved = createCommonMediaPreviewSurface(document, {
    dataUrl: 'data:video/x-matroska;base64,AAAA',
    mediaInfo: matroskaInfo,
  });
  assert.equal(preserved.querySelector('video'), null);
  assert.match(preserved.textContent ?? '', /Preserved-only MKV/u);
  assert.match(preserved.textContent ?? '', /exact original remains available for export/u);

  const malformed = createCommonMediaPreviewSurface(document, {
    dataUrl: 'https://media.example/video.mp4',
    mediaInfo: mp4Info,
  });
  assert.equal(malformed.querySelector('video'), null);
  assert.match(malformed.textContent ?? '', /Preserved-only MP4/u);
});

test('native playback failure revokes the object URL without overwriting the failure status', (t) => {
  const originalCanPlayType = HTMLMediaElement.prototype.canPlayType;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const revoked: string[] = [];
  HTMLMediaElement.prototype.canPlayType = () => 'probably';
  URL.createObjectURL = () => 'blob:image-trail/common-media-error';
  URL.revokeObjectURL = (url) => revoked.push(url);
  t.after(() => {
    HTMLMediaElement.prototype.canPlayType = originalCanPlayType;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  const surface = createCommonMediaPreviewSurface(document, {
    dataUrl: 'data:video/mp4;base64,AAAA',
    mediaInfo: mp4Info,
  });
  const video = surface.querySelector('video');
  assert.ok(video);
  video.dispatchEvent(new Event('loadedmetadata'));
  assert.match(surface.textContent ?? '', /MP4 ready/u);
  video.dispatchEvent(new Event('error'));
  assert.match(surface.textContent ?? '', /playback failed safely/u);
  assert.deepEqual(revoked, ['blob:image-trail/common-media-error']);
});
