import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const sourcePath = path.join(
  rootDir,
  'image-url-token-editor.bookmarklet.src',
  'image-url-token-editor.bookmarklet.src.js',
);
const distDir = path.join(rootDir, 'dist');
const minifiedPath = path.join(distDir, 'image-url-token-editor.bookmarklet.min.js');
const bookmarkletPath = path.join(distDir, 'image-url-token-editor.bookmarklet.txt');

const source = await readFile(sourcePath, 'utf8');
const minifyResult = await minify(source, {
  ecma: 5,
  compress: {
    passes: 2,
  },
  mangle: true,
  format: {
    ascii_only: true,
    comments: false,
  },
});

if (!minifyResult.code) {
  throw new Error('Minification failed: no output code was produced.');
}

await mkdir(distDir, { recursive: true });

const minifiedCode = `${minifyResult.code}\n`;
const bookmarkletCode = `javascript:${minifyResult.code}\n`;

await writeFile(minifiedPath, minifiedCode, 'utf8');
await writeFile(bookmarkletPath, bookmarkletCode, 'utf8');

console.log(`Wrote ${path.relative(rootDir, minifiedPath)}`);
console.log(`Wrote ${path.relative(rootDir, bookmarkletPath)}`);
