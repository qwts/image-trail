import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MINIFICATION_CHECK_BYTES = 1_024;
const MAX_UNIMPROVED_RATIO = 0.98;

export function isReleaseBuild(environment = process.env) {
  return environment.IMAGE_TRAIL_RELEASE_BUILD === '1';
}

export function extensionBuildOptions({ entryPoint, outfile, format, jsx = null, release = isReleaseBuild() }) {
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
