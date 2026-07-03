import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encryptedImageExportResultMessage,
  filenameForExportedImage,
  filenameForExportedImageRecord,
  imageDownloadResultMessage,
} from '../extension/src/ui/panel/export-download.js';

test('imageDownloadResultMessage names the failed file when nothing started', () => {
  assert.equal(
    imageDownloadResultMessage({ requested: 1, started: 0, failed: 1, saveAsFallbacks: 0, failedFileNames: ['one.jpg'] }),
    'Image export failed for one.jpg.',
  );
  assert.equal(
    imageDownloadResultMessage({ requested: 0, started: 0, failed: 0, saveAsFallbacks: 0, failedFileNames: [] }),
    'Image export could not be started.',
  );
});

test('imageDownloadResultMessage summarizes partial failures, fallbacks, and clean runs', () => {
  assert.equal(
    imageDownloadResultMessage({ requested: 3, started: 2, failed: 1, saveAsFallbacks: 0, failedFileNames: ['three.jpg'] }),
    'Started 2 of 3 image downloads. 1 failed.',
  );
  assert.equal(
    imageDownloadResultMessage({ requested: 1, started: 1, failed: 0, saveAsFallbacks: 1, failedFileNames: [] }),
    'Save As unavailable; started 1 image download normally.',
  );
  assert.equal(
    imageDownloadResultMessage({ requested: 2, started: 2, failed: 0, saveAsFallbacks: 2, failedFileNames: [] }),
    'Save As unavailable; started 2 image downloads normally.',
  );
  assert.equal(
    imageDownloadResultMessage({ requested: 1, started: 1, failed: 0, saveAsFallbacks: 0, failedFileNames: [] }),
    'Image export started.',
  );
  assert.equal(
    imageDownloadResultMessage({ requested: 2, started: 2, failed: 0, saveAsFallbacks: 0, failedFileNames: [] }),
    'Started 2 image downloads.',
  );
});

test('encryptedImageExportResultMessage covers failure, partial, and success shapes', () => {
  assert.equal(
    encryptedImageExportResultMessage({ requested: 1, started: 0, failed: 1, encryptionLocked: true, failedFileNames: ['one.jpg'] }),
    'Encrypted image export failed for one.jpg.',
  );
  assert.equal(
    encryptedImageExportResultMessage({ requested: 0, started: 0, failed: 0, encryptionLocked: false, failedFileNames: [] }),
    'Encrypted image export could not be started.',
  );
  assert.equal(
    encryptedImageExportResultMessage({ requested: 3, started: 2, failed: 1, encryptionLocked: false, failedFileNames: ['three.jpg'] }),
    'Started 2 of 3 encrypted image exports. 1 failed.',
  );
  assert.equal(
    encryptedImageExportResultMessage({ requested: 1, started: 1, failed: 0, encryptionLocked: false, failedFileNames: [] }),
    'Encrypted image export started.',
  );
  assert.equal(
    encryptedImageExportResultMessage({ requested: 2, started: 2, failed: 0, encryptionLocked: false, failedFileNames: [] }),
    'Started 2 encrypted image exports.',
  );
});

test('filenameForExportedImage derives names from URLs and data-URL mime types', () => {
  assert.equal(filenameForExportedImage('https://example.test/photos/picture.jpg'), 'picture.jpg');
  assert.equal(filenameForExportedImage('data:image/png;base64,AAAA'), 'image-trail-image.png');
  assert.equal(filenameForExportedImage('data:image/jpeg;base64,AAAA'), 'image-trail-image.jpg');
  assert.equal(filenameForExportedImage('data:image/svg+xml;base64,AAAA'), 'image-trail-image.png');
});

test('filenameForExportedImageRecord prefers the record label over the URL basename', () => {
  assert.equal(
    filenameForExportedImageRecord({ url: 'https://example.test/photos/raw-name.jpg', label: 'Pretty name', title: undefined }),
    'Pretty name.jpg',
  );
});
