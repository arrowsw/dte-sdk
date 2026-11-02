# Entry points

Status: decided on 2026-11-02, for phases 1 to 4. Tracks [issue #5](https://github.com/arrowsw/dte-sdk/issues/5).

**Decision: keep one root entry.** Phase 5 reopens this if the PDF dependencies justify a subpath.

## Measurements

Minified and brotli-compressed, whole bundle:

| After | ESM | CJS |
|---|---|---|
| Phase 1 | under 16 kB | under 16 kB |
| Phase 2 | 25.65 kB | 25.9 kB |
| Phase 3 | 31.85 kB | 32.07 kB |
| Phase 4 | 44.45 kB | 44.64 kB |

## Why not subpaths now

- **The errors would stop matching.** Each subpath bundle would carry its own copy of `DteError`, so `instanceof` fails
  between entries. Avoiding that means marking shared modules as external, and those are internal today.
- **The portal is not a separate layer.** It reuses `send`, `withRetry` and the redaction of the web services client.
- **The root entry already behaves.** `sideEffects` is `false`, so bundlers drop what a consumer does not import, and
  importing the root evaluates no `node:` module: the Node adapters load them on first use. A test guards this on both
  bundles.

## What this leaves open

Adding subpaths later while keeping the symbols on the root breaks nothing. Removing symbols from the root would be a
breaking change.
