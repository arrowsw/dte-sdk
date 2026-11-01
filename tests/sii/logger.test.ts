import { silentLogger } from '../../src/sii/logger'

describe('silentLogger', () => {
  test.each(['debug', 'info', 'warn', 'error'] as const)('%s swallows the call', (level) => {
    expect(silentLogger[level]('message', { operation: 'getSeed' })).toBeUndefined()
    expect(silentLogger[level]('message')).toBeUndefined()
  })
})
