// TypeScript keeps relative specifiers as written, and the sources leave out the extension. The package is an ES module,
// so a consumer on `moduleResolution: nodenext` needs the extension: without it, every type behind that specifier
// silently becomes `any` under `skipLibCheck`. The dist smoke test type-checks a consumer to guard this.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const RELATIVE_SPECIFIER = /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g

const withExtension = (file, specifier) => {
  const target = join(dirname(file), specifier)
  if (existsSync(`${target}.d.ts`)) return `${specifier}.js`
  if (existsSync(join(target, 'index.d.ts'))) return `${specifier}/index.js`
  return specifier
}

const declarations = readdirSync('dist', { recursive: true })
  .filter((name) => name.endsWith('.d.ts'))
  .map((name) => join('dist', name))

for (const file of declarations) {
  const source = readFileSync(file, 'utf8')
  const rewritten = source.replace(RELATIVE_SPECIFIER, (_match, before, quote, specifier) => {
    return `${before}${quote}${withExtension(file, specifier)}${quote}`
  })
  if (rewritten !== source) writeFileSync(file, rewritten)
}
