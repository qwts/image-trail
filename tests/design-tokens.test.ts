import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const tokens = read('extension/src/ui/styles/tokens.css');
const panel = read('extension/src/ui/styles/panel.css');
const designSystem = read('extension/src/ui/styles/design-system.css');
const galleryTokens = read('extension/src/gallery/gallery-tokens.css');
const galleryHtml = read('extension/src/gallery/gallery.html');
const manifest = JSON.parse(read('extension/manifest.json')) as {
  web_accessible_resources: Array<{ resources: string[] }>;
};

const requiredTokens = [
  '--it-panel-bg',
  '--it-drawer-bg',
  '--it-text',
  '--it-accent',
  '--it-accent-row',
  '--it-error',
  '--it-warn',
  '--it-ok',
  '--it-font-ui',
  '--it-font-mono',
  '--it-space-6',
  '--it-radius-panel',
  '--it-panel-width',
  '--it-icon-btn',
  '--it-shadow-panel',
  '--it-glow-target',
  '--it-opacity-locked',
  '--it-opacity-key-gone',
  '--it-blur-privacy',
  '--it-dur-fast',
  '--it-dur-fade',
  '--it-dur-sweep',
  '--it-dur-dot',
] as const;

test('canonical tokens cover both document and Shadow DOM scopes', () => {
  assert.match(tokens, /:root,\s*:host\s*\{/u);
  for (const token of requiredTokens) {
    assert.match(tokens, new RegExp(`${token}:\\s*[^;]+;`, 'u'));
  }
});

test('panel and Gallery consume the same token source', () => {
  assert.match(panel, /^@import '\.\/design-system\.css';/u);
  assert.match(designSystem, /^@import '\.\/tokens\.css';/u);
  assert.match(panel, /width:\s*min\(var\(--it-panel-width\),/u);
  assert.match(panel, /background:\s*var\(--it-panel-bg\);/u);
  assert.match(galleryTokens, /^@import '\.\.\/ui\/styles\/tokens\.css';/u);
  assert.match(galleryTokens, /--image-trail-gallery-panel:\s*var\(--it-panel-bg\);/u);
  assert.match(galleryTokens, /--image-trail-gallery-accent:\s*var\(--it-accent-row\);/u);
  assert.ok(galleryHtml.indexOf('gallery.css') < galleryHtml.indexOf('gallery-tokens.css'));
});

test('the injected stylesheet can load its token dependency', () => {
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  assert.ok(resources.includes('src/ui/styles/tokens.css'));
});
