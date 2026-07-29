import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { packageDirFromModulePath } from './license-policy.mjs';

const MINIFICATION_CHECK_BYTES = 1_024;
const MAX_UNIMPROVED_RATIO = 0.98;

// Single source of truth for the bundled extension entry points. The per-entry
// build scripts and the license scan both read this so a new bundle can never
// ship code whose dependencies escape the license gate.
export const EXTENSION_ENTRY_POINTS = {
  content: {
    entryPoint: 'extension/src/content/content-script.ts',
    outfile: 'extension/dist/src/content/content-script.js',
    format: 'iife',
  },
  serviceWorker: {
    entryPoint: 'extension/src/background/service-worker.ts',
    outfile: 'extension/dist/src/background/service-worker.js',
    format: 'esm',
  },
  gallery: {
    entryPoint: 'extension/src/gallery/gallery.ts',
    outfile: 'extension/dist/src/gallery/gallery.js',
    format: 'esm',
    jsx: 'automatic',
  },
  destination: {
    entryPoint: 'extension/src/destinations/destination-page.tsx',
    outfile: 'extension/dist/src/destinations/destination-page.js',
    format: 'esm',
    jsx: 'automatic',
  },
  preview: { entryPoint: 'extension/src/preview/preview.js', outfile: 'extension/dist/src/preview/preview.js', format: 'iife' },
};

export function isReleaseBuild(environment = process.env) {
  return environment.IMAGE_TRAIL_RELEASE_BUILD === '1';
}

export function isInteropFeatureEnabled(environment = process.env) {
  return environment.IMAGE_TRAIL_ENABLE_INTEROP === '1';
}

export function opensPanelShadowForE2E(environment = process.env) {
  return environment.IMAGE_TRAIL_E2E_OPEN_SHADOW === '1';
}

export function extensionOutputPath(sourcePath, pathApi = path) {
  const sourceRoot = pathApi.join('extension', 'src');
  const relativePath = pathApi.relative(sourceRoot, sourcePath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relativePath)) {
    throw new Error(`Extension source path must be inside ${sourceRoot}: ${sourcePath}`);
  }
  return pathApi.join('extension', 'dist', 'src', relativePath);
}

export function extensionBuildOptions({
  entryPoint,
  outfile,
  format,
  jsx = null,
  release = isReleaseBuild(),
  interopEnabled = isInteropFeatureEnabled(),
  openPanelShadowForE2E = opensPanelShadowForE2E(),
}) {
  return {
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format,
    platform: 'browser',
    target: 'es2022',
    ...(jsx ? { jsx } : {}),
    define: {
      'process.env.NODE_ENV': '"production"',
      __IMAGE_TRAIL_E2E_OPEN_SHADOW__: openPanelShadowForE2E ? 'true' : 'false',
      __IMAGE_TRAIL_INTEROP_ENABLED__: interopEnabled ? 'true' : 'false',
    },
    minify: release,
    legalComments: release ? 'eof' : 'inline',
    ...(release ? { drop: ['debugger'], pure: ['console.debug'] } : {}),
    logLevel: 'info',
  };
}

export async function buildExtensionEntry(configuration) {
  const release = configuration.release ?? isReleaseBuild();
  const options = extensionBuildOptions({ ...configuration, release });
  let unminifiedBytes = null;

  if (release) {
    const reference = await build({ ...options, minify: false, write: false, logLevel: 'silent' });
    unminifiedBytes = reference.outputFiles.reduce((total, file) => total + file.contents.byteLength, 0);
  }

  const result = await build({ ...options, metafile: true });
  const outputBytes = Object.values(result.metafile.outputs).reduce((total, output) => total + output.bytes, 0);
  if (unminifiedBytes !== null) reportMinification(configuration.outfile, unminifiedBytes, outputBytes);
}

// Resolve the set of installed package directories whose code esbuild actually
// bundles into the shipped extension, across every entry point. This is the
// authoritative "what ships" list — it captures dependencies regardless of
// whether npm classified them as prod or dev (e.g. valibot).
export async function bundledPackageDirectories(entryPoints = Object.values(EXTENSION_ENTRY_POINTS)) {
  const directories = new Set();
  for (const entry of entryPoints) {
    const options = extensionBuildOptions({ ...entry, release: false });
    const result = await build({ ...options, write: false, metafile: true, logLevel: 'silent' });
    for (const input of Object.keys(result.metafile.inputs)) {
      const directory = packageDirFromModulePath(input);
      if (directory) directories.add(directory);
    }
  }
  return [...directories].sort();
}

export async function writeStylesheet(sourcePath, outputPath, { release = isReleaseBuild() } = {}) {
  const source = await readFile(sourcePath, 'utf8');
  const output = release
    ? (
        await transform(source, {
          loader: 'css',
          minify: true,
          legalComments: 'eof',
          sourcefile: sourcePath,
        })
      ).code
    : source;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  if (release) reportMinification(outputPath, Buffer.byteLength(source), Buffer.byteLength(output));
}

export function minificationImproved(unminifiedBytes, minifiedBytes) {
  return unminifiedBytes < MINIFICATION_CHECK_BYTES || minifiedBytes < unminifiedBytes * MAX_UNIMPROVED_RATIO;
}

function reportMinification(label, unminifiedBytes, minifiedBytes) {
  if (!minificationImproved(unminifiedBytes, minifiedBytes)) {
    throw new Error(`Release minification did not materially reduce ${label}: ${unminifiedBytes} -> ${minifiedBytes} bytes`);
  }
  const reduction = unminifiedBytes === 0 ? 0 : Math.round((1 - minifiedBytes / unminifiedBytes) * 100);
  console.log(`Release minification: ${label} ${unminifiedBytes} -> ${minifiedBytes} bytes (${reduction}% smaller)`);
}
