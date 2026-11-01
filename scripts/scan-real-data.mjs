// Fails when a tracked file in the published/scanned areas contains a RUT outside the
// allow-list, a local machine path, or a tracked secret. This repository is public and must
// never carry a real taxpayer.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SCANNED_PREFIXES = ['src/', 'tests/', 'scripts/', 'README.md', 'llms.txt', 'CHANGELOG.md', 'docs/']
const TEXT_EXTENSIONS = /\.(ts|js|mjs|cjs|json|md|xml|yml|yaml|txt)$/

// Documentation and SII constants only. Adding one is a deliberate decision: ask whose it is first.
const ALLOWED_RUTS = new Set([
  '60803000-K', // SII
  '66666666-6', // final consumer
  '55555555-5', // foreign receiver placeholder
  '44444446-0', // SII placeholder
  '76543210-3', // fixture issuer
  '76543210-K', // documentation RUT (invalid verifier on purpose)
  '77111222-3', // documentation RUT
  '12345678-5', // rut.ts documentation RUT
  '11111111-1', // rut.ts documentation RUT
  '12345678-9', // documentation (invalid verifier)
  '14625621-K', // rut.ts documentation RUT
  '10000004-0', // rut.ts documentation RUT
  '18264950-3', // rut.ts documentation RUT
  '7654321-6', // documentation RUT
  '9876543-2', // documentation RUT
])
const RUT_PATTERN = /\b\d{1,2}(?:\.\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/g
const LOCAL_PATH_PATTERN = /\/Users\/|\/home\/[a-z]|C:\\Users\\/
const SECRET_FILE_PATTERN = /\.(pfx|p12|pem|key)$|(^|\/)\.env(\.|$)/

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && SCANNED_PREFIXES.some((prefix) => file.startsWith(prefix)))

const problems = []
for (const file of tracked) {
  if (SECRET_FILE_PATTERN.test(file) && !file.startsWith('tests/fixtures/')) {
    problems.push(`${file}: secret-looking file is tracked`)
    continue
  }
  if (!TEXT_EXTENSIONS.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(RUT_PATTERN)) {
    const canonical = match[0].replace(/\./g, '').toUpperCase()
    if (!ALLOWED_RUTS.has(canonical)) problems.push(`${file}: RUT not in allow-list: ${canonical}`)
  }
  if (LOCAL_PATH_PATTERN.test(text)) problems.push(`${file}: local machine path`)
}

if (problems.length > 0) {
  console.error('Real-data scan FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}
console.log(`Real-data scan ok (${tracked.length} files)`)
