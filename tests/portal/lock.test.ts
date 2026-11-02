import { createMemoryPortalLock } from '../../src/portal/lock'

const deferred = (): { readonly promise: Promise<void>; readonly resolve: () => void } => {
  const box: { resolve: () => void } = { resolve: () => undefined }
  const promise = new Promise<void>((resolve) => {
    box.resolve = resolve
  })
  return { promise, resolve: () => box.resolve() }
}

test('one holder at a time per key', async () => {
  const lock = createMemoryPortalLock()
  const gate = deferred()
  const order: string[] = []
  const first = lock('a', async () => {
    order.push('first start')
    await gate.promise
    order.push('first end')
    return 1
  })
  const second = lock('a', async () => {
    order.push('second')
    return 2
  })
  await Promise.resolve()
  expect(order).toEqual(['first start'])
  gate.resolve()
  await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
  expect(order).toEqual(['first start', 'first end', 'second'])
})

test('another key does not wait', async () => {
  const lock = createMemoryPortalLock()
  const gate = deferred()
  const held = lock('a', () => gate.promise)
  await expect(lock('b', async () => 'free')).resolves.toBe('free')
  gate.resolve()
  await held
})

test('a failure hands the lock over and reaches its caller', async () => {
  const lock = createMemoryPortalLock()
  const failing = lock('a', async () => {
    throw new Error('boom')
  })
  const next = lock('a', async () => 'next')
  await expect(failing).rejects.toThrow('boom')
  await expect(next).resolves.toBe('next')
})
