import { hello } from '../src'

describe('hello', () => {
  test('returns the placeholder message', () => {
    expect(hello()).toBe('dte-sdk is coming')
  })
})
