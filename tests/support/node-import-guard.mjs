// ESM loader hooks for the dist smoke test: while the entry module is being loaded, a `node:` import made by the
// entry itself (not by its dependencies) is an error. Dynamic `import('node:…')` inside a function only reaches the
// loader when it runs, so a bundle that loads the Node adapters lazily passes.
let entry = ''

export const initialize = (data) => {
  entry = data.entry
}

export const resolve = (specifier, context, nextResolve) => {
  if (specifier.startsWith('node:') && context.parentURL === entry) throw new Error(`eager import of ${specifier}`)
  return nextResolve(specifier, context)
}
