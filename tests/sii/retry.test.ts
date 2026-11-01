import { DteError } from '../../src/errors'
import {
  DEFAULT_RETRY_POLICY,
  isRetryableError,
  mergeRetryPolicy,
  retryDelayMs,
  withRetry,
  type RetryPolicy,
} from '../../src/sii/retry'

const sleeps = (): { readonly calls: number[]; readonly sleep: (ms: number) => Promise<void> } => {
  const calls: number[] = []
  return {
    calls,
    sleep: async (ms) => {
      calls.push(ms)
    },
  }
}
const fast: RetryPolicy = {
  ...DEFAULT_RETRY_POLICY,
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 250,
  jitterRatio: 0,
}
const failing =
  (errors: readonly unknown[], result = 'ok') =>
  async (attempt: number): Promise<string> => {
    const error = errors[attempt - 1]
    if (error !== undefined) throw error
    return result
  }

describe('isRetryableError', () => {
  test.each([
    [new DteError('TRANSPORT_FAILED'), true],
    [new DteError('REQUEST_TIMEOUT'), true],
    [new DteError('SII_RESPONSE_INVALID'), true],
    [new DteError('SII_QUERY_ERROR'), true],
    [new DteError('SII_HTTP_ERROR', { httpStatus: 503 }), true],
    [new DteError('SII_HTTP_ERROR', { httpStatus: 429 }), true],
    [new DteError('SII_HTTP_ERROR', { httpStatus: 405 }), true],
    [new DteError('SII_HTTP_ERROR', { httpStatus: 400 }), false],
    [new DteError('SII_UPLOAD_REJECTED', { status: '9' }), true],
    [new DteError('SII_UPLOAD_REJECTED', { status: '7' }), false],
    [new DteError('SII_TOKEN_INVALID'), false],
    [new DteError('REQUEST_ABORTED'), false],
    [new Error('plain'), false],
    [null, false],
  ])('%p → %s', (error, expected) => {
    expect(isRetryableError(error)).toBe(expected)
  })
})

describe('retryDelayMs', () => {
  test('exponential backoff capped at maxDelayMs, jitter around the base', () => {
    const half = () => 0.5
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 1, half)).toBe(2000)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 2, half)).toBe(3600)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 3, half)).toBe(6480)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 10, half)).toBe(15000)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 1, () => 0)).toBe(1600)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 1, () => 1)).toBe(2400)
    expect(retryDelayMs(DEFAULT_RETRY_POLICY, 1)).toBeGreaterThanOrEqual(1600)
  })
})

describe('mergeRetryPolicy', () => {
  test('false disables, undefined keeps, partial merges over the base or the defaults', () => {
    expect(mergeRetryPolicy(DEFAULT_RETRY_POLICY, false)).toBe(false)
    expect(mergeRetryPolicy(fast, undefined)).toBe(fast)
    expect(mergeRetryPolicy(fast, { maxAttempts: 9 })).toEqual({ ...fast, maxAttempts: 9 })
    expect(mergeRetryPolicy(false, { maxAttempts: 2 })).toEqual({ ...DEFAULT_RETRY_POLICY, maxAttempts: 2 })
  })
})

describe('withRetry', () => {
  test('returns the first successful result without sleeping', async () => {
    const s = sleeps()
    expect(await withRetry(fast, failing([]), { sleep: s.sleep })).toBe('ok')
    expect(s.calls).toEqual([])
  })

  test('retries retryable errors with the policy delays and reports attempts', async () => {
    const s = sleeps()
    const seen: number[] = []
    const result = await withRetry(
      fast,
      failing([new DteError('TRANSPORT_FAILED'), new DteError('SII_HTTP_ERROR', { httpStatus: 503 })]),
      {
        sleep: s.sleep,
        onRetry: (_error, attempt) => seen.push(attempt),
      },
    )
    expect(result).toBe('ok')
    expect(s.calls).toEqual([100, 180])
    expect(seen).toEqual([1, 2])
  })

  test('gives up after maxAttempts and annotates the error with the attempt count', async () => {
    const s = sleeps()
    const errors = [
      new DteError('TRANSPORT_FAILED'),
      new DteError('TRANSPORT_FAILED'),
      new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }),
    ]
    await expect(withRetry(fast, failing(errors), { sleep: s.sleep })).rejects.toMatchObject({
      code: 'TRANSPORT_FAILED',
      details: { reason: 'ECONNRESET', attempts: 3 },
    })
    expect(s.calls).toEqual([100, 180])
  })

  test('non-retryable DteErrors and plain errors stop at once', async () => {
    const s = sleeps()
    await expect(
      withRetry(fast, failing([new DteError('SII_TOKEN_INVALID')]), { sleep: s.sleep }),
    ).rejects.toMatchObject({
      code: 'SII_TOKEN_INVALID',
      details: { attempts: 1 },
    })
    const plain = new Error('boom')
    await expect(withRetry(fast, failing([plain]), { sleep: s.sleep })).rejects.toBe(plain)
    expect(s.calls).toEqual([])
  })

  test('policy false means a single attempt', async () => {
    const s = sleeps()
    await expect(
      withRetry(false, failing([new DteError('TRANSPORT_FAILED')]), { sleep: s.sleep }),
    ).rejects.toMatchObject({
      details: { attempts: 1 },
    })
    expect(s.calls).toEqual([])
  })

  test('retryAfterMs from the error wins over the backoff, capped at maxDelayMs', async () => {
    const s = sleeps()
    const errors = [
      new DteError('SII_HTTP_ERROR', { httpStatus: 405, retryAfterMs: 50 }),
      new DteError('SII_HTTP_ERROR', { httpStatus: 405, retryAfterMs: 9000 }),
    ]
    expect(await withRetry(fast, failing(errors), { sleep: s.sleep })).toBe('ok')
    expect(s.calls).toEqual([50, 250])
  })

  test('custom retryOn on the call or on the policy', async () => {
    const s = sleeps()
    const onlyTimeouts = (error: DteError) => error.code === 'REQUEST_TIMEOUT'
    await expect(
      withRetry(fast, failing([new DteError('TRANSPORT_FAILED')]), { sleep: s.sleep, retryOn: onlyTimeouts }),
    ).rejects.toMatchObject({ details: { attempts: 1 } })
    expect(
      await withRetry({ ...fast, retryOn: onlyTimeouts }, failing([new DteError('REQUEST_TIMEOUT')]), {
        sleep: s.sleep,
      }),
    ).toBe('ok')
    expect(s.calls).toEqual([100])
  })

  test('the call retryOn and the policy retryOn must both agree', async () => {
    const s = sleeps()
    const yes = () => true
    const no = () => false
    const timeout = new DteError('REQUEST_TIMEOUT')
    // The policy refuses: a call that accepts cannot override it.
    await expect(
      withRetry({ ...fast, retryOn: no }, failing([timeout]), { sleep: s.sleep, retryOn: yes }),
    ).rejects.toMatchObject({ details: { attempts: 1 } })
    // The call refuses: a policy that accepts cannot override it.
    await expect(
      withRetry({ ...fast, retryOn: yes }, failing([timeout]), { sleep: s.sleep, retryOn: no }),
    ).rejects.toMatchObject({ details: { attempts: 1 } })
    // The policy has no retryOn of its own, so `isRetryableError` is the policy's rule, and a call cannot widen it.
    await expect(
      withRetry(fast, failing([new DteError('SII_TOKEN_INVALID')]), { sleep: s.sleep, retryOn: yes }),
    ).rejects.toMatchObject({ code: 'SII_TOKEN_INVALID', details: { attempts: 1 } })
    expect(s.calls).toEqual([])
    // Both accept.
    expect(await withRetry({ ...fast, retryOn: yes }, failing([timeout]), { sleep: s.sleep, retryOn: yes })).toBe('ok')
    expect(s.calls).toEqual([100])
  })

  test('jitter uses the injected random', async () => {
    const s = sleeps()
    const jittery = { ...fast, jitterRatio: 0.5 }
    expect(
      await withRetry(jittery, failing([new DteError('TRANSPORT_FAILED')]), { sleep: s.sleep, random: () => 1 }),
    ).toBe('ok')
    expect(s.calls).toEqual([150])
  })
})
