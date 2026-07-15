import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const tokens = read('extension/src/ui/styles/tokens.css');
const panelEntry = read('extension/src/ui/styles/panel.css');
const panel = `${panelEntry}\n${['foundation', 'sections', 'controls', 'cloud', 'settings', 'records']
  .map((name) => read(`extension/src/ui/styles/panel-legacy-${name}.css`))
  .join('\n')}`;
const designSystem = read('extension/src/ui/styles/design-system.css');
const galleryTokens = read('extension/src/gallery/gallery-tokens.css');
const gallery = `${read('extension/src/gallery/gallery.css')}\n${read('extension/src/gallery/gallery-filters.css')}`;
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

test('panel and Gallery consume canonical tokens and shared primitives', () => {
  assert.match(panel, /^@import '\.\/design-system\.css';/u);
  assert.match(designSystem, /^@import '\.\/tokens\.css';/u);
  assert.match(panel, /width:\s*min\(var\(--it-panel-width\),/u);
  assert.match(panel, /background:\s*var\(--it-panel-bg\);/u);
  assert.match(galleryTokens, /^@import '\.\.\/ui\/styles\/tokens\.css';/u);
  assert.match(galleryTokens, /@import '\.\.\/ui\/styles\/primitives\.css';/u);
  assert.match(galleryTokens, /@import '\.\.\/ui\/styles\/feedback-primitives\.css';/u);
  assert.match(galleryTokens, /@import '\.\.\/ui\/styles\/record-row\.css';/u);
  assert.doesNotMatch(galleryTokens, /--image-trail-gallery-/u);
  assert.doesNotMatch(gallery, /--image-trail-gallery-/u);
  assert.doesNotMatch(gallery, /(?:^|\n)button(?:,|\s*\{)/u);
  assert.match(gallery, /var\(--it-header-bg\)/u);
  assert.ok(galleryHtml.indexOf('gallery-tokens.css') < galleryHtml.indexOf('gallery.css'));
  assert.ok(galleryHtml.indexOf('gallery.css') < galleryHtml.indexOf('gallery-filters.css'));
});

test('the injected stylesheet can load its token dependency', () => {
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  assert.ok(resources.includes('src/ui/styles/tokens.css'));
});
