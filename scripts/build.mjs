// Build: ES modules only, one file per public entry plus the chunks they share, minified, with source maps that point at
// the shipped `src/` instead of embedding them. A shared chunk is what keeps one copy of `DteError` across the entries.
// Dependencies stay external (they are real runtime dependencies in package.json). `dist/` starts empty because chunk
// names carry a hash, so a stale one would otherwise be published.
import { rm } from 'node:fs/promises'
import { build } from 'esbuild'

// `node:*` stays external: the Node adapters import `node:https` and `node:fs/promises` lazily, inside the
// function that needs them, so loading an entry never evaluates them. The root entry does not reach them at all.
const EXTERNAL = ['node-forge', '@xmldom/xmldom', 'fast-xml-parser', 'rut.ts', 'pdf-lib', 'bwip-js', 'node:*']

const ENTRIES = {
  index: 'src/index.ts',
  node: 'src/node/index.ts',
  portal: 'src/portal/index.ts',
  pdf: 'src/pdf/index.ts',
}

await rm('dist', { recursive: true, force: true })

await build({
  entryPoints: ENTRIES,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  outdir: 'dist',
  outExtension: { '.js': '.min.js' },
  chunkNames: 'chunks/[hash]',
  minify: true,
  sourcemap: true,
  sourcesContent: false,
  external: EXTERNAL,
  legalComments: 'none',
  logLevel: 'info',
})
