import { cp, mkdir } from 'node:fs/promises';

await mkdir('extension/dist', { recursive: true });
await cp('extension/manifest.json', 'extension/dist/manifest.json');
await mkdir('extension/dist/src/ui/styles', { recursive: true });
await cp('extension/src/ui/styles/panel.css', 'extension/dist/src/ui/styles/panel.css');
