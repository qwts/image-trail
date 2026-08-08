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
  readonly assets: readonly {
    readonly file: string;
    readonly sourceCommit: string;
    readonly width: number;
    readonly height: number;
    readonly sha256: string;
  }[];
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
  assert.deepEqual(evidence.release.workflowEvidence, {
    ci: 'https://github.com/qwts/image-trail/actions/runs/31051521404',
    versionCut: 'https://github.com/qwts/image-trail/actions/runs/31051521263',
    release: 'https://github.com/qwts/image-trail/actions/runs/31051828001',
  });

  assert.equal(evidence.assets.length, 3);
  assert.deepEqual(
    evidence.assets.map((asset) => asset.file),
    [
      'store-assets/releases/v0.26.6/icon128.png',
      'store-assets/releases/v0.26.6/image-trail-screenshot-1280x800.png',
      'store-assets/releases/v0.26.6/image-trail-small-promo-440x280.png',
    ],
  );
  const expectedAssets = [
    {
      file: 'store-assets/releases/v0.26.6/icon128.png',
      width: 128,
      height: 128,
      sha256: 'b1faf228a9332523b724543677d921dec87fb5303b3b82c3a1d176a65b23009b',
    },
    {
      file: 'store-assets/releases/v0.26.6/image-trail-screenshot-1280x800.png',
      width: 1280,
      height: 800,
      sha256: '859b89a13e9c4371d84ebb4d6301bbef5ae71732c937f90d4b959a1f9a2f6378',
    },
    {
      file: 'store-assets/releases/v0.26.6/image-trail-small-promo-440x280.png',
      width: 440,
      height: 280,
      sha256: '0ce322069e4486b84604f29641954bb85b022f1e44df4c3494eba651225bbac4',
    },
  ] as const;
  for (let index = 0; index < expectedAssets.length; index += 1) {
    const expected = expectedAssets[index]!;
    const asset = evidence.assets[index]!;
    assert.deepEqual(
      asset,
      {
        file: expected.file,
        sourceCommit: evidence.release.commit,
        width: expected.width,
        height: expected.height,
        sha256: expected.sha256,
      },
      `${expected.file} should match the audited record`,
    );
    const bytes = readFileSync(path.resolve(asset.file));
    assert.deepEqual([...bytes.subarray(0, 8)], pngSignature, `${asset.file} should be a PNG`);
    assert.equal(bytes.readUInt32BE(16), expected.width, `${asset.file} should match the audited width`);
    assert.equal(bytes.readUInt32BE(20), expected.height, `${asset.file} should match the audited height`);
    assert.equal(sha256(asset.file), expected.sha256, `${asset.file} should match the audited SHA-256`);
  }
});
