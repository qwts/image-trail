import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const assets = [
  { file: 'image-trail-screenshot-1280x800.png', width: 1280, height: 800 },
  { file: 'image-trail-small-promo-440x280.png', width: 440, height: 280 },
] as const;

type SubmissionEvidence = {
  readonly schemaVersion: number;
  readonly auditedAt: string;
  readonly release: {
    readonly tag: string;
    readonly commit: string;
    readonly zip: { readonly name: string; readonly url: string; readonly sha256: string; readonly size: number };
    readonly manifest: {
      readonly version: string;
      readonly permissions: readonly string[];
      readonly optionalHostPermissions: readonly string[];
      readonly nativeMessaging: boolean;
    };
    readonly workflowEvidence: Record<string, string>;
  };
  readonly assets: readonly { readonly file: string; readonly width: number; readonly height: number; readonly sha256: string }[];
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.resolve(file), 'utf8')) as T;
}

function sha256(file: string): string {
  return createHash('sha256')
    .update(readFileSync(path.resolve(file)))
    .digest('hex');
}

test('Chrome Web Store assets are valid PNGs with the required dimensions', () => {
  for (const asset of assets) {
    const bytes = readFileSync(path.resolve('store-assets', asset.file));
    assert.deepEqual([...bytes.subarray(0, 8)], pngSignature, `${asset.file} should be a PNG`);
    assert.equal(bytes.readUInt32BE(16), asset.width, `${asset.file} should have the required width`);
    assert.equal(bytes.readUInt32BE(20), asset.height, `${asset.file} should have the required height`);
    assert.ok(bytes.byteLength > 10_000, `${asset.file} should contain a rendered asset, not an empty placeholder`);
  }
});

test('Chrome Web Store submission evidence locks the audited release, manifest, workflows, and asset bytes', () => {
  const evidence = readJson<SubmissionEvidence>('store-assets/submission-v0.26.6.json');

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.auditedAt, '2026-08-07');
  assert.equal(evidence.release.tag, 'v0.26.6');
  assert.equal(evidence.release.commit, '6fbd99522e1e9541620780df9cbeadde06db3a47');
  assert.deepEqual(evidence.release.zip, {
    name: 'image-trail-v0.26.6.zip',
    url: 'https://github.com/qwts/image-trail/releases/download/v0.26.6/image-trail-v0.26.6.zip',
    sha256: '8fc3454bd65302933e3f4cb4b82c4bf78ae2f904b93e691ef9ee8fc15fdb388e',
    size: 629_902,
  });
  assert.equal(evidence.release.manifest.version, '0.26.6');
  assert.equal(evidence.release.manifest.nativeMessaging, false);
  assert.deepEqual(evidence.release.manifest.permissions, [
    'activeTab',
    'scripting',
    'downloads',
    'identity',
    'storage',
    'declarativeNetRequestWithHostAccess',
  ]);
  assert.deepEqual(evidence.release.manifest.optionalHostPermissions, ['http://*/*', 'https://*/*']);
  assert.deepEqual(Object.keys(evidence.release.workflowEvidence).sort(), ['ci', 'release', 'versionCut']);
  for (const url of Object.values(evidence.release.workflowEvidence))
    assert.match(url, /^https:\/\/github\.com\/qwts\/image-trail\/actions\/runs\/\d+$/u);

  assert.equal(evidence.assets.length, 3);
  for (const asset of evidence.assets) {
    const bytes = readFileSync(path.resolve(asset.file));
    assert.deepEqual([...bytes.subarray(0, 8)], pngSignature, `${asset.file} should be a PNG`);
    assert.equal(bytes.readUInt32BE(16), asset.width, `${asset.file} should match the audited width`);
    assert.equal(bytes.readUInt32BE(20), asset.height, `${asset.file} should match the audited height`);
    assert.equal(sha256(asset.file), asset.sha256, `${asset.file} should match the audited SHA-256`);
  }
});
