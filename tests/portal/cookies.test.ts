import {
  cookieHeader,
  hasSessionCookie,
  mergeSetCookie,
  parseCookies,
  serializeCookies,
  sessionRut,
  splitSetCookie,
} from '../../src/portal/cookies'

test('a comma splits cookies only when a name follows', () => {
  expect(splitSetCookie('a=1; Path=/, b=2; Expires=Thu, 01 Jan 2026 00:00:00 GMT; Secure, c=3')).toEqual([
    'a=1; Path=/',
    'b=2; Expires=Thu, 01 Jan 2026 00:00:00 GMT; Secure',
    'c=3',
  ])
})

test('merging replaces by name, keeps `=` in values and ignores nonsense', () => {
  expect(mergeSetCookie({ a: 'old', keep: 'x' }, 'a=new=er; Path=/, noequals, =novalue')).toEqual({
    a: 'new=er',
    keep: 'x',
  })
  expect(mergeSetCookie({}, 'noequals')).toEqual({})
  const jar = { a: '1' }
  expect(mergeSetCookie(jar, undefined)).toBe(jar)
})

test('the header joins the jar', () => {
  expect(cookieHeader({ a: '1', b: '2' })).toBe('a=1; b=2')
  expect(cookieHeader({})).toBe('')
})

test('a session cookie is what marks a session', () => {
  expect(hasSessionCookie({ 'NETSCAPE_LIVEWIRE.rut': '1' })).toBe(true)
  expect(hasSessionCookie({ TS01: 'x' })).toBe(false)
})

test('the RUT of the session prefers the represented one', () => {
  expect(sessionRut({ 'NETSCAPE_LIVEWIRE.rut': '12345678', 'NETSCAPE_LIVEWIRE.dv': '5' })).toBe('12345678-5')
  expect(
    sessionRut({
      'NETSCAPE_LIVEWIRE.rut': '12345678',
      'NETSCAPE_LIVEWIRE.dv': '5',
      'NETSCAPE_LIVEWIRE.rutm': '76543210',
      'NETSCAPE_LIVEWIRE.dvm': '3',
    }),
  ).toBe('76543210-3')
  expect(sessionRut({ 'NETSCAPE_LIVEWIRE.rut': '12345678', 'NETSCAPE_LIVEWIRE.dv': '9' })).toBeNull()
  expect(sessionRut({})).toBeNull()
})

test('the stored form round trips and unreadable text is an empty jar', () => {
  expect(parseCookies(serializeCookies({ a: '1' }))).toEqual({ a: '1' })
  expect(parseCookies('not json')).toEqual({})
  expect(parseCookies('[1]')).toEqual({})
  expect(parseCookies('null')).toEqual({})
  expect(parseCookies('3')).toEqual({})
})
