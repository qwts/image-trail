import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const primitiveCss = read('extension/src/ui/styles/primitives.css');
const feedbackCss = read('extension/src/ui/styles/feedback-primitives.css');
const panelShellCss = read('extension/src/ui/styles/panel-shell.css');
const primaryWorkflowCss = read('extension/src/ui/styles/primary-workflow.css');
const designSystemCss = read('extension/src/ui/styles/design-system.css');
const css = `${primitiveCss}\n${feedbackCss}\n${panelShellCss}\n${primaryWorkflowCss}`;
const panel = read('extension/src/ui/styles/panel.css');
const manifest = JSON.parse(read('extension/manifest.json')) as {
  web_accessible_resources: Array<{ resources: string[] }>;
};

test('primitive styles expose variants and semantic states', () => {
  for (const selector of [
    "[data-variant='primary']",
    "[data-variant='secondary']",
    "[data-variant='ghost']",
    "[data-variant='danger']",
    '.is-active',
    '.is-waiting',
    ':disabled',
    "[aria-invalid='true']",
    "[data-tone='success']",
    "[data-tone='warning']",
    "[data-tone='error']",
  ]) {
    assert.ok(css.includes(selector), `missing primitive style contract: ${selector}`);
  }
});

test('primitive styles preserve focus and reduced-motion behavior', () => {
  assert.match(css, /:focus-visible[\s\S]*outline:\s*var\(--it-focus-ring\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/u);
  assert.match(css, /data-reduced-motion-preview='true'/u);
  assert.match(css, /data-reduced-motion-preview='true'[^{]*\.is-waiting[^{]*\x7b\s*animation:\s*none;/u);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.is-waiting[^{]*\x7b\s*animation:\s*none;/u);
});

test('SectionHeader title track can shrink without pushing actions outside narrow panels', () => {
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(0, max-content\)/u);
  assert.match(css, /\.image-trail-ds__section-title[\s\S]*min-width:\s*0;[\s\S]*text-overflow:\s*ellipsis;/u);
});

test('panel packaging loads design-system stylesheets after tokens', () => {
  assert.match(panel, /^@import '\.\/design-system\.css';/u);
  assert.equal(
    designSystemCss,
    "@import './tokens.css';\n@import './primitives.css';\n@import './feedback-primitives.css';\n@import './panel-shell.css';\n@import './primary-workflow.css';\n",
  );
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  assert.ok(resources.includes('src/ui/styles/design-system.css'));
  assert.ok(resources.includes('src/ui/styles/primitives.css'));
  assert.ok(resources.includes('src/ui/styles/feedback-primitives.css'));
  assert.ok(resources.includes('src/ui/styles/panel-shell.css'));
  assert.ok(resources.includes('src/ui/styles/primary-workflow.css'));
});
