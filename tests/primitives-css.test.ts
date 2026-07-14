import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const primitiveCss = read('extension/src/ui/styles/primitives.css');
const feedbackCss = read('extension/src/ui/styles/feedback-primitives.css');
const panelShellCss = read('extension/src/ui/styles/panel-shell.css');
const primaryWorkflowCss = read('extension/src/ui/styles/primary-workflow.css');
const recordRowCss = read('extension/src/ui/styles/record-row.css');
const fieldsCss = read('extension/src/ui/styles/fields.css');
const designSystemCss = read('extension/src/ui/styles/design-system.css');
const css = `${primitiveCss}\n${feedbackCss}\n${panelShellCss}\n${primaryWorkflowCss}\n${recordRowCss}\n${fieldsCss}`;
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

test('RecordRow styles keep selection stronger than stored-original and cover private lock states', () => {
  assert.match(recordRowCss, /data-state='selected'[\s\S]*--it-record-border:[\s\S]*box-shadow:\s*var\(--it-glow-row\)/u);
  assert.match(recordRowCss, /data-state='locked-encrypted'[\s\S]*var\(--it-opacity-locked\)/u);
  assert.match(recordRowCss, /data-state='key-unavailable'[\s\S]*var\(--it-opacity-key-gone\)/u);
  assert.match(recordRowCss, /record-stored-original[\s\S]*inline-size:\s*6px/u);
  assert.match(recordRowCss, /record-privacy-veil[\s\S]*backdrop-filter:\s*var\(--it-blur-privacy\)/u);
});

test('FieldRow styles expose semantic states, privacy masking, and narrow reflow', () => {
  for (const state of ['active', 'success', 'unchanged', 'error']) {
    assert.ok(fieldsCss.includes(`[data-state='${state}']`), `missing FieldRow state: ${state}`);
  }
  assert.match(fieldsCss, /field-row\[data-state='active'\][\s\S]*box-shadow:/u);
  assert.match(fieldsCss, /field-input\.is-privacy-masked[\s\S]*input-bg-privacy/u);
  assert.match(fieldsCss, /@container \(max-width: 360px\)[\s\S]*field-control\.has-step-controls/u);
  assert.match(fieldsCss, /prefers-reduced-motion: reduce[\s\S]*field-row[\s\S]*transition:\s*none/u);
});

test('panel packaging loads design-system stylesheets after tokens', () => {
  assert.match(panel, /^@import '\.\/design-system\.css';/u);
  assert.equal(
    designSystemCss,
    "@import './tokens.css';\n@import './primitives.css';\n@import './feedback-primitives.css';\n@import './panel-shell.css';\n@import './primary-workflow.css';\n@import './record-row.css';\n@import './fields.css';\n",
  );
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  assert.ok(resources.includes('src/ui/styles/design-system.css'));
  assert.ok(resources.includes('src/ui/styles/primitives.css'));
  assert.ok(resources.includes('src/ui/styles/feedback-primitives.css'));
  assert.ok(resources.includes('src/ui/styles/panel-shell.css'));
  assert.ok(resources.includes('src/ui/styles/primary-workflow.css'));
  assert.ok(resources.includes('src/ui/styles/record-row.css'));
  assert.ok(resources.includes('src/ui/styles/fields.css'));
});
