import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

test('React is a direct renderer dependency bundled in production mode', () => {
  const manifest = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
  const buildScript = read('scripts/build-content-script.mjs');
  const buildPolicy = read('scripts/extension-build-policy.mjs');

  assert.match(manifest.dependencies?.['react'] ?? '', /^\^19\./u);
  assert.match(manifest.dependencies?.['react-dom'] ?? '', /^\^19\./u);
  assert.match(buildScript, /buildExtensionEntry/u);
  assert.match(buildPolicy, /'process\.env\.NODE_ENV':\s*'"production"'/u);
  assert.doesNotMatch(`${buildScript}\n${buildPolicy}`, /external:\s*\[[^\]]*react/u);
});

test('the production renderer uses local JSX compilation without prototype runtime shortcuts', () => {
  const tsconfig = JSON.parse(read('tsconfig.json')) as { compilerOptions?: { jsx?: string } };
  const rendererSource = [
    read('extension/src/ui/react/panel-header.tsx'),
    read('extension/src/ui/react/target-picker-view.tsx'),
    read('extension/src/ui/react/react-subtree.tsx'),
  ].join('\n');

  assert.equal(tsconfig.compilerOptions?.jsx, 'react-jsx');
  assert.doesNotMatch(rendererSource, /https?:\/\//u);
  assert.doesNotMatch(rendererSource, /localStorage|window\.[A-Za-z_$][\w$]*\s*=|@babel|babel-standalone/u);
});
