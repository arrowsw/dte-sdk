import { expectTypeOf } from 'expect-type'

import { hello } from '../src'

/**
 * Type-level regression tests for the public API.
 *
 * The assertions are wrapped in a function that ts-jest type-checks at compile
 * time but never invokes. If a signature regresses, the file fails to compile
 * — which surfaces as a Jest "suite failed to run" error.
 */

const _typecheck = () => {
  expectTypeOf(hello).toEqualTypeOf<() => string>()
  expectTypeOf(hello()).toEqualTypeOf<string>()
}

describe('type-level contract', () => {
  test('type assertions compile (see _typecheck above)', () => {
    expect(typeof _typecheck).toBe('function')
  })
})
