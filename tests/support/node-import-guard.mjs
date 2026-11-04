// ESM loader hooks for the dist smoke test: while an entry is being loaded, a `node:` import made by a file of its
// directory (the entry or a chunk it shares, not its dependencies) is an error. Dynamic `import('node:…')` inside a
// function only reaches the loader when it runs, so an entry that loads the Node adapters lazily passes.
let scope = ''

export const initialize = (data) => {
  scope = data.scope
}

export const resolve = (specifier, context, nextResolve) => {
  if (specifier.startsWith('node:') && context.parentURL?.startsWith(scope)) {
    throw new Error(`eager import of ${specifier}`)
  }
  return nextResolve(specifier, context)
}
