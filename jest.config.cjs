/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  // Only TS sources are transformed. The dual-package smoke test loads the
  // already-compiled `dist/*.min.js` via Node's own require/import, so handing
  // those `.js` files to ts-jest only produced the spurious `allowJs` warning.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testRegex: '(/tests/.*|(\\.|/)(test|spec))\\.[jt]s$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testEnvironment: 'node',
  // Coverage is measured against source, never the built `dist/*.min.js` that
  // the smoke test imports.
  collectCoverageFrom: ['src/**/*.ts'],
  // Regression ratchet: CI fails on any drop. Lower deliberately (and document
  // why) if real code introduces unreachable defensive branches.
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
}
