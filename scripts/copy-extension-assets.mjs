import { cp, mkdir } from 'node:fs/promises';
import './write-extension-build-info.mjs';

await mkdir('extension/dist', { recursive: true });
await cp('extension/manifest.json', 'extension/dist/manifest.json');
await mkdir('extension/dist/src/ui/styles', { recursive: true });
await cp('extension/src/ui/styles/panel.css', 'extension/dist/src/ui/styles/panel.css');
await mkdir('extension/dist/src/preview', { recursive: true });
await cp('extension/src/preview/preview.html', 'extension/dist/src/preview/preview.html');
await cp('extension/src/preview/preview.js', 'extension/dist/src/preview/preview.js');
