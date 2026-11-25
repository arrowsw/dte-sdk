# Entry points

Status: decided by Hans on 2026-11-04, before 0.1.0. Replaces the decision of 2026-11-02 to keep one root entry (D3, D36,
D40 and D41 of the design specs). Tracks [issue #5](https://github.com/arrowsw/dte-sdk/issues/5).

**Decision: four entries, ES modules only.** A fifth, `dte-sdk/catalogs`, for the SII's large code tables, was decided
by Hans on 2026-11-14. A sixth, `dte-sdk/schemas`, follows the same reasoning for the SII's schemas, which Hans decided
on 2026-11-14 to ship inside the package with their validator as an optional peer.

| Entry | Holds | Size | Reaches `node:` |
|---|---|---|---|
| `dte-sdk` | Documents (export documents included), stamps, signatures, envelopes, books, verification of received documents, the assignment of invoices, SII web services client over `fetch`, public registry of issuers | 48.49 kB | Not by import: it asks the runtime for `node:crypto` at the first signature |
| `dte-sdk/node` | `createNodeHttpsTransport`, `createDirectoryCapture`, `createDirectoryUploadArchive`, `createDirectoryTokenCache`, `createDirectoryFolioRegistry`, `findCafFiles`, `findLatestCafFile`, `resolveCafFile`, `cafFileScope` | 7.4 kB | Yes, on first use |
| `dte-sdk/portal` | Portal, folio registry, register, MIPYME backup, activity verification, certification sets and runner | 86.41 kB | Yes, on first use |
| `dte-sdk/pdf` | Printed samples and the SII office of each commune; `pdf-lib` and `bwip-js` are optional peers | 19.83 kB | Yes, on first use |
| `dte-sdk/catalogs` | The SII's large code tables: the business activities | 10.65 kB | No |
| `dte-sdk/schemas` | The SII's schemas as text and the validation of a document against them; `xmllint-wasm` is an optional peer | 24.72 kB | No |

Size is min + brotli of the entry and the chunks it reaches, with dependencies left out, as `.size-limit.json` measures
it. The decision was taken at phase 5b-2, which took `dte-sdk/portal` from 39.35 kB to 55.86 kB; each limit was then the
measure rounded up to the next 2 kB. The sizes above were measured again on 2026-11-25. `createDirectoryTokenCache` took
`dte-sdk/node` from 4.19 kB to 4.71 kB, and the CAF file search, which parses CAFs, took it to 6.30 kB, over its 6 kB
limit, which went to 8 kB. The SII office table took `dte-sdk/pdf` from 8.49 kB to 10.45 kB. That table is about 1.9 kB
of data that the renderer needs for its default office, so it fits neither the root (30.49 kB plus the table is
32.44 kB, over 32 kB) nor the old 10 kB limit of `dte-sdk/pdf`, which went to 11 kB. The fixes found against the folio
pages of the certification environment, also on 2026-11-07, took `dte-sdk/portal` from 71.59 kB to 72.28 kB, over its
72 kB limit, which went to 74 kB. The public registry of issuers, a plain call with no certificate or session, went to
the root with the receiver's answer, which took it to 31.54 kB; the communes the office table lacked took `dte-sdk/pdf`
to 10.70 kB. The catalog of the register's document codes took `dte-sdk/portal` from 72.28 kB to 72.99 kB, under its limit.
The activity verification, on 2026-11-08, took it to 73.82 kB, still under its limit.
The verification of received documents, on 2026-11-09, took `dte-sdk` from 31.54 kB to 33.87 kB, over its 32 kB limit,
which went to 34 kB, and the stricter checks it brought (the signature, and the `<CAF>` block `parseCaf` keeps) took
`dte-sdk/portal` to 73.88 kB.
Returning the CAFs a batch request already holds, with its check of the quantity, took `dte-sdk/portal` to 73.95 kB,
still under its limit. Returning what the other folio flows already hold when a later step fails (the annulment's tally,
the CAFs a re-obtaining downloaded, the memory of an exact request that annulled), with the original error logged,
took it to 74.33 kB, over its 74 kB limit, which went to 76 kB.
The fixes in #57, on 2026-11-10, took `dte-sdk` from 33.87 kB to 34.36 kB, over its 34 kB
limit, which went to 36 kB: the check that a CAF's two keys are a pair, its character references read as the DOM reads
them, the depth every DOM is allowed and the `codResp` of the receiver's answer. With them `dte-sdk/node`, which now
reads a CAF file by its declaration, went to 7.09 kB, `dte-sdk/portal` to 74.90 kB and `dte-sdk/pdf` to 10.93 kB, all
under their limits.
The receiver's answer for a document paid in cash and the registry's code 27, on 2026-11-11, measured `dte-sdk` at
34.33 kB; the other entries did not move.
Keeping folios stocked in one call, on 2026-11-12, took `dte-sdk/portal` from 74.90 kB to 76.73 kB, over its 76 kB
limit, which went to 78 kB.
The transport fields of 2026 and the totals and rules of the settlement invoice, on 2026-11-13, took `dte-sdk` from
34.33 kB to 35.1 kB, `dte-sdk/portal` from 76.73 kB to 77.43 kB and `dte-sdk/pdf` from 10.93 kB to 10.98 kB, all under
their limits; `dte-sdk/node` did not move.
The transport area of the printed sample, after 0.10.0, took `dte-sdk/pdf` from 10.98 kB to 11.45 kB, over its 11 kB
limit, which went to 12 kB; the other entries did not move.
A receipt's own shape in the codec and what `createDocument` refuses on one, on 2026-11-14, took `dte-sdk` from 35.1 kB
to 35.51 kB and `dte-sdk/portal` from 77.43 kB to 77.82 kB, and reading a receipt's line of business took `dte-sdk/pdf`
from 11.45 kB to 11.47 kB, all under their limits; `dte-sdk/node` did not move.
The printed sample on continuous paper, with the stamp as an option for receipts, took `dte-sdk/pdf` from 11.47 kB to
13.2 kB, over its 12 kB limit, which went to 14 kB; the other entries did not move.
The receiver's answers to a received envelope (the reception answer, the commercial result and the receipts, each with
the caller's decisions and the catalogs of states), which the certification's exchange now builds on, took `dte-sdk` from
35.51 kB to 37.27 kB, over its 36 kB limit, which went to 38 kB, and `dte-sdk/portal` from 77.82 kB to 78.51 kB, over its
78 kB limit, which went to 80 kB; `dte-sdk/node` and `dte-sdk/pdf` did not move.
Numbers written with the decimals the schema holds, the withholding code on the lines, an upload held to the cover of
its file, a capture that never writes over a file, CAF files by environment and a simulation that keeps what it
stamped, after 0.11.0, took `dte-sdk` from 37.27 kB to 37.62 kB, `dte-sdk/node` from 7.09 kB to 7.36 kB and
`dte-sdk/portal` from 78.51 kB to 78.98 kB, all under their limits; `dte-sdk/pdf` did not move.
The strict reading of a received envelope, which the answers share with the verification, and the checks on the
decisions of the commercial result and the receipts, also after 0.11.0, took `dte-sdk` from 37.62 kB to 37.66 kB and
`dte-sdk/portal` from 78.98 kB to 79.02 kB, both under their limits; `dte-sdk/node` and `dte-sdk/pdf` did not move.
The SII's tables of additional taxes, payment media and reference documents, after 0.12.0, took `dte-sdk` from
37.66 kB to 38.87 kB, over its 38 kB limit, which went to 40 kB, and `dte-sdk/portal` from 79.02 kB to 79.03 kB, under
its limit; `dte-sdk/node` and `dte-sdk/pdf` did not move.
The business activities, also after 0.12.0, went to an entry of their own, `dte-sdk/catalogs`, which Hans decided on
2026-11-14: the SII's list of 674 codes, each with its name and three columns, is 10.65 kB, about 10 kB more on the
root for every consumer, or on `dte-sdk/portal` past its 80 kB limit. In an entry of its own only who imports it pays
for it, and the name leaves room for the next large tables, such as communes or customs. Its limit is the measure
rounded up to the next 2 kB, 12 kB; the other entries did not move.
The printed sample of several pages took `dte-sdk/pdf` from 13.2 kB to 13.72 kB, under its 14 kB limit; the other
entries did not move.
The commissions and other charges of a settlement invoice, and the additional taxes and withholdings with the printed
names of their codes, on the printed sample, took `dte-sdk/pdf` from 13.72 kB to 14.89 kB, over its 14 kB limit, which
went to 16 kB; the other entries did not move.
The days reobtaining reaches in production, with the ranges left outside them in the report, and the days of an
annulment counted in Chile, also after 0.12.0, took `dte-sdk` from 38.87 kB to 38.95 kB and `dte-sdk/portal` from
79.03 kB to 79.27 kB, both under their limits; the other entries did not move.
The settlement set in the certification runner, after 0.12.0, took `dte-sdk/portal` from 79.27 kB to 79.83 kB, under
its 80 kB limit; the other entries did not move.
The content rules `createDocument` checks before stamping, and the count of an envelope's documents, after 0.12.0,
took `dte-sdk` from 38.95 kB to 39.47 kB, under its limit, and `dte-sdk/portal` from 79.83 kB to 80.36 kB, over its
80 kB limit, which went to 82 kB; the new error code took `dte-sdk/node` from 7.36 kB to 7.37 kB, under its
limit; `dte-sdk/pdf` did not move.
The fields Formato DTE 2.5 marks to be printed, the total in words, the names of the documents a reference can name,
and the stamp taken as it was signed, after 0.13.0, took `dte-sdk/pdf` from 14.89 kB to 17.7 kB, over its 16 kB
limit, which went to 18 kB. Taking the stamp as it was signed checks its `FRMT`, so the entry now reaches the RSA and
element helpers the root already had. Sharing those helpers moved `dte-sdk` from 39.47 kB to 39.46 kB,
`dte-sdk/node` from 7.37 kB to 7.4 kB and `dte-sdk/portal` from 80.36 kB to 80.33 kB, all under their limits;
`dte-sdk/catalogs` did not move.
The rest of the fields Formato DTE 2.5 marks to be printed (the payment, the special invoice, the issuer of a guide for
export, the principal and the requester, the document of a foreign receiver, the bases, the deposit guarantee, the
totals in another currency, and what prints under an item) took `dte-sdk/pdf` from 17.7 kB to 19.03 kB, over its
18 kB limit, which went to 20 kB; the other entries did not move.
The bound on the key a signature is checked with, also after 0.13.0, went into the RSA helper every check shares,
in place of the bound the printed stamp carried, and took `dte-sdk` from 39.46 kB to 39.52 kB, `dte-sdk/node` from
7.4 kB to 7.38 kB, `dte-sdk/portal` from 80.33 kB to 80.32 kB and `dte-sdk/pdf` from 19.03 kB to 19.07 kB, all under
their limits; `dte-sdk/catalogs` did not move.
Reading a code's name among the own entries of its table, so that a received document whose code is `constructor`
prints, took `dte-sdk/pdf` from 19.07 kB to 19.04 kB, under its limit; the other entries did not move.
The verdict of an upload settled with its counts per document type, the runtime's own RSA beside the JavaScript engine,
the line of a withholding agent, the withheld VAT of a purchase book where the format puts it, the mailbox of the
exchange and the stamp in bytes at a fixed level, after 0.14.0, took `dte-sdk` from 39.51 kB to 40.08 kB, over its
40 kB limit, which went to 42 kB, `dte-sdk/portal` from 80.41 kB to 81.32 kB and `dte-sdk/pdf` from 19.33 kB to
19.59 kB, both under their limits; `dte-sdk/node` and `dte-sdk/catalogs` did not move.

The runtime's own RSA is the one place where the root names a `node:` module, and it does so without importing it. The
first signature of a process asks `process.getBuiltinModule('node:crypto')`, a call Node, Bun and Deno answer and a
browser does not have, so the root still bundles for the browser with no configuration, loading it still evaluates no
`node:` module, and nothing is resolved by a bundler. An entry that had to be imported for the faster signature would
have left it off for whoever signs with the root alone.
The portal client that signs in with a tax password, also after 0.14.0, took `dte-sdk/portal` from 81.32 kB to
81.68 kB, under its limit, and the password taken out of a captured login form took `dte-sdk` from 40.08 kB to
40.15 kB, under its limit; the other entries did not move.
The purchase and sales register as a file, also after 0.14.0, took `dte-sdk/portal` from 81.68 kB to 82.03 kB, over
its 82 kB limit, which went to 84 kB; the other entries did not move.
The SII's schemas, also after 0.14.0, went to an entry of their own, `dte-sdk/schemas`: its 14 files are 475 kB of
text, 23.59 kB compressed, which no other entry should carry for whoever never validates. They are text inside the
entry and not files beside it, so the entry needs no file system and no way to find its own directory, which the
tests, run from source, and the shipped ES modules do not share. Its limit is the measure rounded up to the next 2 kB,
24 kB; the other entries did not move.
The assignment of invoices, also after 0.14.0, measured before and after on the same machine: the builder, the reader
and verifier of the file and the two unstable calls to the registry of credit transfers took `dte-sdk` from 40.12 kB to
43.06 kB, over its 42 kB limit, which went to 44 kB; the three schema files of the assignment file took
`dte-sdk/schemas` from 23.59 kB to 24.64 kB, over its 24 kB limit, which went to 26 kB. The registry's endpoints in the
client, the upload kind and the new error code took `dte-sdk/node` from 7.38 kB to 7.4 kB, `dte-sdk/portal` from
82.01 kB to 82.11 kB and `dte-sdk/pdf` from 19.58 kB to 19.59 kB, all under their limits; `dte-sdk/catalogs` did not
move. The assignment stays in the root, beside the answers to a received envelope it resembles: it builds on the
document's signature and the upload of the web services client, which the root already carries.
The export documents (110, 111, 112), also after 0.14.0, measured before and after on the same machine: their root of
its own in the codec, what `createDocument` refuses and requires on one, the customs area, the currencies of the
schema and the exact arithmetic of their amounts and of their totals in pesos took `dte-sdk` from 43.06 kB to
46.24 kB, over its 44 kB limit, which went to 48 kB, and `dte-sdk/portal`, whose certification runner builds documents
with the same code, from 82.11 kB to 84.82 kB, over its 84 kB limit, which went to 86 kB; their names took
`dte-sdk/pdf` from 19.59 kB to 19.68 kB, under its limit; `dte-sdk/node`, `dte-sdk/catalogs` and `dte-sdk/schemas` did
not move. They stay in the root with the other document types: they are issued, stamped, signed and sent through the
same functions.
The fixes that followed in #117, on 2026-11-20, to the password sign-in, the signature of the assignment, the export
documents, the schemas and the books, took `dte-sdk` from 46.24 kB to 46.69 kB, `dte-sdk/portal` from 84.82 kB to
85.24 kB, `dte-sdk/pdf` from 19.68 kB to 19.69 kB and `dte-sdk/schemas` from 24.64 kB to 24.72 kB, all under their
limits; `dte-sdk/node` and `dte-sdk/catalogs` did not move.
Refusing a line percent whose share of the line rounds to no peso, on 2026-11-23, took `dte-sdk` from 46.69 kB to
46.71 kB and `dte-sdk/portal` from 85.24 kB to 85.41 kB, both under their limits; the other entries did not move.
Working a line's amounts out over decimal digits and writing each line as field 38 of Formato DTE 2.5 asks, also on
2026-11-23, took `dte-sdk` from 46.71 kB to 47.29 kB, `dte-sdk/portal` from 85.41 kB to 85.92 kB and `dte-sdk/pdf`
from 19.69 kB to 19.7 kB, all under their limits; the other entries did not move. `dte-sdk/portal` is 0.08 kB under
its 86 kB limit.
Breaking a header too long for one line, the decimals of a percent's share on an export line and its warning,
`IVANoRet`, `ValorDROtrMnda`, the digest of a received envelope, the site the legend under the stamp names and the
wrapped lines of the issuer, on 2026-11-24, took `dte-sdk` from 47.56 kB to 47.86 kB, `dte-sdk/portal`, whose
certification runner builds documents with the same code, from 85.98 kB to 86.43 kB, over its 86 kB limit, which went
to 88 kB, and `dte-sdk/pdf` from 19.68 kB to 19.8 kB; the other entries did not move.
Reporting who signed a received document, with the check of its certificate against the ones the caller trusts, on
2026-11-25, took `dte-sdk` from 47.86 kB to 48.49 kB, over its 48 kB limit, which went to 50 kB; `dte-sdk/portal`
measured 86.41 kB and `dte-sdk/pdf` 19.83 kB.

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
evaluates no `node:` module, that the root imports none and names only `node:crypto`, in the call that asks the runtime
for it, that only `dte-sdk/pdf` names the optional peers, that only
`dte-sdk/catalogs` reaches the table of business activities, that errors cross the entries, that the root and
`dte-sdk/catalogs` bundle for the browser, and that consumers on nodenext, bundler and node10 resolution get real types.
The CI imports every entry on Bun and Deno.

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
