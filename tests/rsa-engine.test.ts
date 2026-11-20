import forge from 'node-forge'
import { fixtureText } from './support/fixtures'

const keyPem = fixtureText('cert.key.pem')

type Rsa = typeof import('../src/crypto/rsa')
type Builtin = (id: string) => unknown

// The signature the JavaScript engine writes, worked out here without the module under test.
const expected = (pem: string, data: string): string => {
  const md = forge.md.sha1.create()
  md.update(forge.util.encodeUtf8(data))
  return forge.util.encode64(forge.pki.privateKeyFromPem(pem).sign(md))
}

// The engine is settled once per process, so each case loads the module anew, with the runtime it is given.
const withRuntime = async (builtin: Builtin | undefined, run: (rsa: Rsa) => void): Promise<void> => {
  const spy =
    builtin === undefined ? null : jest.spyOn(process, 'getBuiltinModule').mockImplementation(builtin as never)
  try {
    await jest.isolateModulesAsync(async () => run(await import('../src/crypto/rsa')))
  } finally {
    spy?.mockRestore()
  }
}

const real = process.getBuiltinModule('node:crypto')
type Key = ReturnType<typeof real.createPrivateKey>
const createPrivateKey = (pem: string): Key => real.createPrivateKey(pem)
const sign = (bytes: Uint8Array, key: Key) => real.sign('RSA-SHA1', bytes, key)

describe('the engine that signs', () => {
  test('nothing is settled before the first signature', async () => {
    await withRuntime(undefined, (rsa) => expect(rsa.rsaSigningEngine()).toBeNull())
  })

  test('the runtime signs once its first signature equals the one of the JavaScript engine', async () => {
    const calls: string[] = []
    const builtin: Builtin = (id) => {
      calls.push(id)
      return { createPrivateKey, sign: (_algorithm: string, bytes: Uint8Array, key: Key) => sign(bytes, key) }
    }
    await withRuntime(builtin, (rsa) => {
      expect(rsa.rsaSha1SignBase64(keyPem, 'first ñ')).toBe(expected(keyPem, 'first ñ'))
      expect(rsa.rsaSigningEngine()).toBe('native')
      expect(rsa.rsaSha1SignBase64(keyPem, 'second')).toBe(expected(keyPem, 'second'))
      expect(rsa.rsaSha1SignBase64(keyPem, '<DD>ñ</DD>', 'latin1')).not.toBe(
        rsa.rsaSha1SignBase64(keyPem, '<DD>ñ</DD>'),
      )
      // The module is asked for once, and by its name with the scheme, so no bundle resolves it.
      expect(calls).toEqual(['node:crypto'])
    })
  })

  test('the real runtime agrees with the JavaScript engine, with a 512-bit key as a CAF brings', async () => {
    const small = forge.pki.privateKeyToPem(forge.pki.rsa.generateKeyPair({ bits: 512, e: 0x10001 }).privateKey)
    await withRuntime(undefined, (rsa) => {
      expect(rsa.rsaSha1SignBase64(small, 'DD')).toBe(expected(small, 'DD'))
      expect(rsa.rsaSha1SignBase64(small, 'DD again')).toBe(expected(small, 'DD again'))
      expect(rsa.rsaSha1SignBase64(keyPem, 'abc')).toBe(expected(keyPem, 'abc'))
      expect(['native', 'portable']).toContain(rsa.rsaSigningEngine())
    })
  })

  test.each<[string, Builtin]>([
    ['has no crypto module', () => undefined],
    ['has one that does not sign', () => ({})],
    [
      'throws when asked',
      () => {
        throw new Error('no builtin modules here')
      },
    ],
    ['has one that signs and reads no key', () => ({ sign: () => ({ toString: () => 'AAAA' }) })],
    ['signs something else', () => ({ createPrivateKey, sign: () => ({ toString: () => 'AAAA' }) })],
    [
      'refuses the signature',
      () => ({
        createPrivateKey,
        sign: () => {
          throw new Error('digital envelope routines::invalid digest')
        },
      }),
    ],
    [
      'reads the key as one that is not RSA',
      () => ({
        createPrivateKey: () => ({ asymmetricKeyType: 'ec' }),
        sign: (_algorithm: string, bytes: Uint8Array) => sign(bytes, createPrivateKey(keyPem)),
      }),
    ],
  ])('a runtime that %s leaves the JavaScript engine in charge', async (_name, builtin) => {
    await withRuntime(builtin, (rsa) => {
      expect(rsa.rsaSha1SignBase64(keyPem, 'abc')).toBe(expected(keyPem, 'abc'))
      expect(rsa.rsaSigningEngine()).toBe('portable')
      expect(rsa.rsaSha1SignBase64(keyPem, 'again')).toBe(expected(keyPem, 'again'))
    })
  })

  test('a key the trusted runtime refuses is still signed, and the runtime keeps signing the others', async () => {
    let refuse = false
    const builtin: Builtin = () => ({
      createPrivateKey,
      sign: (_algorithm: string, bytes: Uint8Array, key: Key) => {
        if (refuse) throw new Error('key too small')
        return sign(bytes, key)
      },
    })
    await withRuntime(builtin, (rsa) => {
      rsa.rsaSha1SignBase64(keyPem, 'settle')
      refuse = true
      expect(rsa.rsaSha1SignBase64(keyPem, 'refused')).toBe(expected(keyPem, 'refused'))
      expect(rsa.rsaSigningEngine()).toBe('native')
      refuse = false
      expect(rsa.rsaSha1SignBase64(keyPem, 'after')).toBe(expected(keyPem, 'after'))
    })
  })

  test('a key that is not RSA is never handed to the runtime, which would sign with it as what it is', async () => {
    const curve = real
      .generateKeyPairSync('ec', { namedCurve: 'P-256' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    // The runtime, asked for RSA-SHA1 with this key, answers an ECDSA signature and no error.
    expect(real.sign('RSA-SHA1', new Uint8Array([1]), curve).length).toBeLessThan(80)
    const signedWith: (string | undefined)[] = []
    const builtin: Builtin = () => ({
      createPrivateKey,
      sign: (_algorithm: string, bytes: Uint8Array, key: Key) => {
        signedWith.push(key.asymmetricKeyType)
        return sign(bytes, key)
      },
    })
    await withRuntime(builtin, (rsa) => {
      rsa.rsaSha1SignBase64(keyPem, 'settle')
      expect(rsa.rsaSigningEngine()).toBe('native')
      expect(() => rsa.rsaSha1SignBase64(curve, 'abc')).toThrow(/RSAPrivateKey/)
      expect(signedWith).toEqual(['rsa'])
      expect(rsa.rsaSha1SignBase64(keyPem, 'after')).toBe(expected(keyPem, 'after'))
      expect(rsa.rsaSigningEngine()).toBe('native')
    })
  })

  test('without a process, as in a browser, there is no runtime to ask', async () => {
    const want = expected(keyPem, 'abc')
    await jest.isolateModulesAsync(async () => {
      const rsa = await import('../src/crypto/rsa')
      // The module is loaded with a process, which its dependency reads on import; the signature runs without one.
      const replaced = jest.replaceProperty(globalThis, 'process', undefined as never)
      try {
        expect(rsa.rsaSha1SignBase64(keyPem, 'abc')).toBe(want)
        expect(rsa.rsaSigningEngine()).toBe('portable')
      } finally {
        replaced.restore()
      }
    })
  })

  test('a process that offers no builtin modules, as an older runtime, is the same', async () => {
    await jest.isolateModulesAsync(async () => {
      const rsa = await import('../src/crypto/rsa')
      const replaced = jest.replaceProperty(globalThis, 'process', {} as never)
      try {
        expect(rsa.rsaSha1SignBase64(keyPem, 'abc')).toBe(expected(keyPem, 'abc'))
        expect(rsa.rsaSigningEngine()).toBe('portable')
      } finally {
        replaced.restore()
      }
    })
  })

  test('an invalid key fails as it always did', async () => {
    await withRuntime(undefined, (rsa) => expect(() => rsa.rsaSha1SignBase64('not a key', 'abc')).toThrow())
  })
})
