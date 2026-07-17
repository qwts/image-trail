import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import './write-extension-build-info.mjs';
import { extensionOutputPath, writeStylesheet } from './extension-build-policy.mjs';

await mkdir('extension/dist', { recursive: true });
await cp('extension/manifest.json', 'extension/dist/manifest.json');
// Ship third-party attribution inside the packaged extension so shipped bundles
// carry the notices for the code they include (react, react-dom, scheduler).
await cp('THIRD-PARTY-LICENSES.txt', 'extension/dist/THIRD-PARTY-LICENSES.txt');
await cp('extension/icons', 'extension/dist/icons', { recursive: true });
await mkdir('extension/dist/src/preview', { recursive: true });
await cp('extension/src/preview/preview.html', 'extension/dist/src/preview/preview.html');
await mkdir('extension/dist/src/gallery', { recursive: true });
await cp('extension/src/gallery/gallery.html', 'extension/dist/src/gallery/gallery.html');
await mkdir('extension/dist/src/destinations', { recursive: true });
await cp('extension/src/destinations/view.html', 'extension/dist/src/destinations/view.html');

const stylesheets = [
  ...(await stylesheetFiles('extension/src/ui/styles')),
  'extension/src/preview/preview.css',
  'extension/src/gallery/gallery-tokens.css',
  'extension/src/gallery/gallery.css',
  'extension/src/gallery/gallery-filters.css',
  'extension/src/destinations/destination-tokens.css',
  'extension/src/destinations/destination-page.css',
  'extension/src/destinations/destination-surfaces.css',
];

for (const sourcePath of stylesheets) {
  await writeStylesheet(sourcePath, extensionOutputPath(sourcePath));
}

async function stylesheetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && path.extname(entry.name) === '.css')
    .map((entry) => path.join(directory, entry.name))
    .sort();
}
