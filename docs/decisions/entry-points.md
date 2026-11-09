# Entry points

Status: decided by Hans on 2026-11-04, before 0.1.0. Replaces the decision of 2026-11-02 to keep one root entry (D3, D36,
D40 and D41 of the design specs). Tracks [issue #5](https://github.com/arrowsw/dte-sdk/issues/5).

**Decision: four entries, ES modules only.**

| Entry | Holds | Size | Reaches `node:` |
|---|---|---|---|
| `dte-sdk` | Documents, stamps, signatures, envelopes, books, verification of received documents, SII web services client over `fetch`, public registry of issuers | 33.61 kB | No |
| `dte-sdk/node` | `createNodeHttpsTransport`, `createDirectoryCapture`, `createDirectoryUploadArchive`, `createDirectoryTokenCache`, `createDirectoryFolioRegistry`, `findCafFiles`, `findLatestCafFile`, `resolveCafFile` | 6.34 kB | Yes, on first use |
| `dte-sdk/portal` | Portal, folio registry, register, MIPYME backup, activity verification, certification sets and runner | 73.82 kB | Yes, on first use |
| `dte-sdk/pdf` | Printed samples and the SII office of each commune; `pdf-lib` and `bwip-js` are optional peers | 10.70 kB | Yes, on first use |

Size is min + brotli of the entry and the chunks it reaches, with dependencies left out, as `.size-limit.json` measures
it. The decision was taken at phase 5b-2, which took `dte-sdk/portal` from 39.35 kB to 55.86 kB; each limit was then the
measure rounded up to the next 2 kB. The sizes above were measured again on 2026-11-07. `createDirectoryTokenCache` took
`dte-sdk/node` from 4.19 kB to 4.71 kB, and the CAF file search, which parses CAFs, took it to 6.30 kB, over its 6 kB
limit, which went to 8 kB. The SII office table took `dte-sdk/pdf` from 8.49 kB to 10.45 kB. That table is about 1.9 kB
of data that the renderer needs for its default office, so it fits neither the root (30.49 kB plus the table is
32.44 kB, over 32 kB) nor the old 10 kB limit of `dte-sdk/pdf`, which went to 11 kB. The fixes found against the folio
pages of the certification environment, also on 2026-11-07, took `dte-sdk/portal` from 71.59 kB to 72.28 kB, over its
72 kB limit, which went to 74 kB. The public registry of issuers, a plain call with no certificate or session, went to
the root with the receiver's answer, which took it to 31.54 kB; the communes the office table lacked took `dte-sdk/pdf`
to 10.70 kB. The catalog of the register's document codes took `dte-sdk/portal` from 72.28 kB to 72.99 kB, under its limit.
The activity verification, on 2026-11-08, took it to 73.82 kB, still under its limit.
The verification of received documents, on 2026-11-09, took `dte-sdk` from 31.54 kB to 33.61 kB, over its 32 kB limit,
which went to 34 kB.

## Why

- **The root entry bundles for the browser with no configuration.** esbuild and webpack failed on the `import('node:…')`
  of the old root, whatever a consumer imported. Now esbuild, webpack, Vite and rollup all build a consumer of the root.
- **One `DteError`.** esbuild shares code between entries only in ESM, and a shared chunk keeps one copy of the class, so
  what any entry throws passes `instanceof` and `isDteError` of the root. Measured on Node, Bun and Deno. Keeping CommonJS
  would leave two classes in one process: an error of the old CommonJS bundle failed `isDteError` of the old ESM bundle.
  `isDteError` stays on `instanceof`, since a process now holds one copy per installed version.
- **The install drops from 44 MB to 6.6 MB.** `pdf-lib` and `bwip-js` were 85 % of it. Only `dte-sdk/pdf` names them, so
  they can be optional peers without breaking anyone else's bundler.
- **Each entry states what it needs.** The root no longer offers Node-only functions to a browser project.
- **It is free only now.** Moving exports and dropping a format break nobody before 0.1.0, and need a major after it.

## What it does not change

A consumer with a bundler gets about the same bytes, because tree-shaking already dropped what it did not import and
`node-forge` is most of the rest. Only a consumer that prints without signing gains, since it no longer loads `node-forge`.

| Consumer, kB min + brotli | SDK code only: before → after | With dependencies, before → after |
|---|---|---|
| Issuing documents | 11.39 → 10.86 | 116.85 → 116.69 |
| Web services | 14.40 → 13.94 | 120.08 → 119.66 |
| Portal | 15.15 → 14.84 | 120.62 → 120.73 |
| Printed samples | 8.05 → 6.96 | 113.73 → 46.13 |
| Certification sets | 18.54 → 18.29 | 124.25 → 124.28 |

The last column leaves out `pdf-lib` and `bwip-js`, which load on first use and add about 360 kB to whoever prints.

## What it costs

- **No CommonJS build, and Node ≥ 22.12.** `require()` loads every entry from that version on (run on Node 22.19 and 24,
  and on Bun), and returns the same module an `import` gets. It loads a little slower than the old CommonJS bundle: 39.7 ms
  against 33.2 ms for the root on top of Node's start.
- **Jest in its default CommonJS mode cannot `require()` an ES module.** A consumer runs Jest in ESM mode or transforms
  this package with `transformIgnorePatterns`. Both were run.
- **Imports move.** 57 runtime names leave the root. No source module moves or is renamed.
- **Whoever prints installs two more packages.** Without them the render functions throw `DEPENDENCY_UNAVAILABLE`.

## What guards it

`tests/public-api.test.ts` holds one list per entry. `tests/dist.smoke.test.ts` loads each entry, checks that loading
evaluates no `node:` module, that the root reaches none, that only `dte-sdk/pdf` names the optional peers, that errors
cross the entries, that the root bundles for the browser, and that consumers on nodenext, bundler and node10 resolution
get real types. The CI imports every entry on Bun and Deno.

## Whole bundle before this decision

Minified and brotli-compressed:

| After | ESM | CJS |
|---|---|---|
| Phase 1 | under 16 kB | under 16 kB |
| Phase 2 | 25.65 kB | 25.9 kB |
| Phase 3 | 31.85 kB | 32.07 kB |
| Phase 4 | 44.45 kB | 44.64 kB |
| Phase 4b | 53.61 kB | 53.72 kB |
| Phase 5b-1 | 59.54 kB | 59.75 kB |
