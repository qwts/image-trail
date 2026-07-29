import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import './write-extension-build-info.mjs';
import { bundleStylesheet, extensionOutputPath, isInjectedStylesheet, writeStylesheet } from './extension-build-policy.mjs';
import { extensionManifestForBuild } from './extension-manifest-policy.mjs';

await mkdir('extension/dist', { recursive: true });
const sourceManifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
await writeFile('extension/dist/manifest.json', `${JSON.stringify(extensionManifestForBuild(sourceManifest), null, 2)}\n`);
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
  const outputPath = extensionOutputPath(sourcePath);
  if (isInjectedStylesheet(sourcePath)) await bundleStylesheet(sourcePath, outputPath);
  else await writeStylesheet(sourcePath, outputPath);
}

async function stylesheetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && path.extname(entry.name) === '.css')
    .map((entry) => path.join(directory, entry.name))
    .sort();
}
