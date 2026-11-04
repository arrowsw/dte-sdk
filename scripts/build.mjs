// Build: one bundle per module format, minified, with a source map that points at the
// shipped `src/` instead of embedding it. Dependencies stay external (they are real
// runtime dependencies in package.json).
import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

// `node:*` stays external: the Node adapters import `node:https` and `node:fs/promises` lazily, inside the
// function that needs them, so the neutral bundle never evaluates them and Deno/Bun/browsers still load it.
const EXTERNAL = ['node-forge', '@xmldom/xmldom', 'fast-xml-parser', 'rut.ts', 'pdf-lib', 'bwip-js', 'node:*']

const TARGETS = [
  { format: 'esm', outfile: 'dist/esm/index.min.js' },
  { format: 'cjs', outfile: 'dist/cjs/index.min.js' },
]

for (const { format, outfile } of TARGETS) {
  await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format,
    platform: 'neutral',
    target: 'es2020',
    outfile,
    minify: true,
    sourcemap: true,
    sourcesContent: false,
    external: EXTERNAL,
    legalComments: 'none',
    logLevel: 'info',
  })
}

await mkdir('dist/cjs', { recursive: true })
await writeFile('dist/cjs/package.json', '{"type":"commonjs"}\n')
