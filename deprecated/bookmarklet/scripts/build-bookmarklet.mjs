import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { minify } from 'terser'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')

const sourcePath = path.join(
  rootDir,
  'image-url-token-editor.bookmarklet.src',
  'image-url-token-editor.bookmarklet.src.js'
)

const distDir = path.join(rootDir, 'dist')

const minifiedFileName = 'image-url-token-editor.bookmarklet.min.js'
const sourceMapFileName = `${minifiedFileName}.map`

const minifiedPath = path.join(distDir, minifiedFileName)
const sourceMapPath = path.join(distDir, sourceMapFileName)
const bookmarkletPath = path.join(distDir, 'image-url-token-editor.bookmarklet.txt')

const sourceFileName = path
  .relative(rootDir, sourcePath)
  .split(path.sep)
  .join('/')

const source = await readFile(sourcePath, 'utf8')

const minifyResult = await minify(
  {
    [sourceFileName]: source
  },
  {
    ecma: 5,
    compress: {
      passes: 2
    },
    sourceMap: {
      filename: minifiedFileName,
      url: sourceMapFileName,
      includeSources: true
    },
    mangle: true,
    format: {
      ascii_only: true,
      comments: false
    }
  }
)

if (!minifyResult.code) {
  throw new Error('Minification failed: no output code was produced.')
}

if (!minifyResult.map) {
  throw new Error('Minification failed: no source map was produced.')
}

await mkdir(distDir, { recursive: true })

const minifiedCode = `${minifyResult.code}\n`

const bookmarkletCodeWithoutSourceMap = minifyResult.code
  .replace(/\n*\/\/# sourceMappingURL=.*$/u, '')

const inlineSourceMap = Buffer
  .from(minifyResult.map, 'utf8')
  .toString('base64')

const debugBookmarkletPayload = `${bookmarkletCodeWithoutSourceMap};
//# sourceURL=bookmarklet://image-url-token-editor/image-url-token-editor.bookmarklet.min.js
//# sourceMappingURL=data:application/json;charset=utf-8;base64,${inlineSourceMap}`

const bookmarkletCode = `javascript:${encodeURIComponent(debugBookmarkletPayload)}\n`

await writeFile(minifiedPath, minifiedCode, 'utf8')
await writeFile(sourceMapPath, `${minifyResult.map}\n`, 'utf8')
await writeFile(bookmarkletPath, bookmarkletCode, 'utf8')