<div align="center">
  <h1>dte-sdk: Chilean electronic tax documents (DTE) with TypeScript.</h1>

[![npm version](https://img.shields.io/npm/v/dte-sdk?color=000&label=npm)](https://www.npmjs.com/package/dte-sdk)
[![types included](https://img.shields.io/npm/types/dte-sdk?color=000)](https://www.npmjs.com/package/dte-sdk)
![zero dependencies](https://img.shields.io/badge/dependencies-0-000)
[![license](https://img.shields.io/npm/l/dte-sdk?color=000)](./LICENSE)

</div>

> **🚧 Work in progress.** `dte-sdk` is a placeholder release. The public API
> is not available yet — for now the package only exports a `hello()` function.

`dte-sdk` will be a TypeScript toolkit for working with Chilean **DTE**
(Documento Tributario Electrónico) as defined by the SII.

- 🪶 **Tiny & zero-dependency** — tree-shakeable ESM, ships only what you import.
- 🧠 **Fully typed** — first-class TypeScript types, no `@types` package needed.
- 🌐 **Universal** — runs in Node (>= 20), the browser, Deno and Bun.

## Installation

```bash
npm install dte-sdk
# or: bun add dte-sdk · pnpm add dte-sdk · yarn add dte-sdk
```

## Quick start

```typescript
import { hello } from 'dte-sdk'

hello() // 'dte-sdk is coming'
```

CommonJS works too:

```javascript
const { hello } = require('dte-sdk')
```

## Development

```bash
npm install          # also builds via `prepare`
npm test             # unit, type-level and dist smoke tests
npm test -- --coverage
npm run build        # tsc (ESM + CJS) + terser
npm run lint         # ESLint flat config + Prettier
npm run size         # bundle size guard (.size-limit.json)
npm run mutation     # Stryker mutation testing (manual, not a CI gate)
```

Releases are tag-triggered and published from CI with npm provenance — see
[RELEASING.md](./RELEASING.md).

## Contributing

Contributions are welcome — feel free to open issues for bugs and feature
requests, or submit a pull request.

## License

[MIT](./LICENSE) © dte-sdk contributors
