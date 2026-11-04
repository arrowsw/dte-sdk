// Build: ES modules only, minified, with source maps that point at the shipped `src/` instead of embedding them.
// Dependencies stay external (they are real runtime dependencies in package.json). `dist/` starts empty so that no stale
// file is published.
import { rm } from 'node:fs/promises'
import { build } from 'esbuild'

// `node:*` stays external: the Node adapters import `node:https` and `node:fs/promises` lazily, inside the
// function that needs them, so the neutral bundle never evaluates them and Deno/Bun/browsers still load it.
const EXTERNAL = ['node-forge', '@xmldom/xmldom', 'fast-xml-parser', 'rut.ts', 'pdf-lib', 'bwip-js', 'node:*']

await rm('dist', { recursive: true, force: true })

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  outfile: 'dist/index.min.js',
  minify: true,
  sourcemap: true,
  sourcesContent: false,
  external: EXTERNAL,
  legalComments: 'none',
  logLevel: 'info',
})
