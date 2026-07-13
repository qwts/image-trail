import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Build the unpacked extension exactly once, before any worker starts. Each worker
// then loads the prebuilt extension/dist read-only (see fixtures.ts), so parallel
// workers never race on `npm run build` — which begins by removing dist/ and would
// otherwise let concurrent builds clobber each other's output.
export default function globalSetup(): void {
  execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit', env: process.env });
  const manifestPath = path.join(repoRoot, 'extension/dist/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  manifest['host_permissions'] = ['http://127.0.0.1/*'];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
