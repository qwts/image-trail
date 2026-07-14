import { cp, mkdir } from 'node:fs/promises';
import './write-extension-build-info.mjs';

await mkdir('extension/dist', { recursive: true });
await cp('extension/manifest.json', 'extension/dist/manifest.json');
await cp('extension/icons', 'extension/dist/icons', { recursive: true });
await mkdir('extension/dist/src/ui', { recursive: true });
await cp('extension/src/ui/styles', 'extension/dist/src/ui/styles', { recursive: true });
await mkdir('extension/dist/src/preview', { recursive: true });
await cp('extension/src/preview/preview.html', 'extension/dist/src/preview/preview.html');
await cp('extension/src/preview/preview.js', 'extension/dist/src/preview/preview.js');
await mkdir('extension/dist/src/gallery', { recursive: true });
await cp('extension/src/gallery/gallery.html', 'extension/dist/src/gallery/gallery.html');
await cp('extension/src/gallery/gallery-tokens.css', 'extension/dist/src/gallery/gallery-tokens.css');
await cp('extension/src/gallery/gallery.css', 'extension/dist/src/gallery/gallery.css');
