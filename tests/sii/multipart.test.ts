import {
  buildMultipartBody,
  buildMultipartParts,
  generateBoundary,
  multipartContentType,
} from '../../src/sii/multipart'
import { DteError } from '../../src/errors'
import { decodeLatin1, encodeLatin1 } from '../../src/text/latin1'

describe('generateBoundary', () => {
  test('browser-like prefix plus 16 alphanumerics from the injected random', () => {
    expect(generateBoundary(() => 0)).toBe('----WebKitFormBoundaryAAAAAAAAAAAAAAAA')
    expect(generateBoundary(() => 0.999999)).toBe('----WebKitFormBoundary9999999999999999')
    expect(generateBoundary()).toMatch(/^----WebKitFormBoundary[A-Za-z0-9]{16}$/)
    expect(multipartContentType('B')).toBe('multipart/form-data; boundary=B')
  })

  test('every position of the alphabet is reachable and a random of exactly 1 stays inside it', () => {
    const fromIndices = (indices: readonly number[]): (() => number) => {
      const next = indices[Symbol.iterator]()
      return () => (next.next().value as number) / 62 + 0.001
    }
    const first = Array.from({ length: 16 }, (_, index) => index)
    expect(generateBoundary(fromIndices(first))).toBe('----WebKitFormBoundaryABCDEFGHIJKLMNOP')
    const edges = [25, 26, 51, 52, 61, 0, 25, 26, 51, 52, 61, 0, 25, 26, 51, 52]
    expect(generateBoundary(fromIndices(edges))).toBe('----WebKitFormBoundaryZaz09AZaz09AZaz0')
    expect(generateBoundary(() => 1)).toBe('----WebKitFormBoundary9999999999999999')
  })
})

describe('buildMultipartBody', () => {
  test('CRLF framing, fields in order, file part with filename and content type, Latin-1 bytes intact', () => {
    const body = buildMultipartBody({
      boundary: 'B',
      fields: [
        { name: 'rutSender', value: '12345678' },
        { name: 'dvSender', value: '5' },
      ],
      file: { name: 'archivo', fileName: 'EnvioDTE.xml', contentType: 'text/xml', bytes: encodeLatin1('<a>á</a>') },
    })
    expect(decodeLatin1(body)).toBe(
      [
        '--B',
        'Content-Disposition: form-data; name="rutSender"',
        '',
        '12345678',
        '--B',
        'Content-Disposition: form-data; name="dvSender"',
        '',
        '5',
        '--B',
        'Content-Disposition: form-data; name="archivo"; filename="EnvioDTE.xml"',
        'Content-Type: text/xml',
        '',
        '<a>á</a>',
        '--B--',
        '',
      ].join('\r\n'),
    )
    expect(Array.from(body).includes(0xe1)).toBe(true)
    expect(Array.from(body).includes(0xc3)).toBe(false)
  })
  test('the five SII parts in order, ASCII framing around file bytes that are copied untouched', () => {
    const everyByte = Uint8Array.from({ length: 256 }, (_, value) => value)
    const boundary = '----WebKitFormBoundaryAbCdEfGhIjKlMnOp'
    const body = buildMultipartBody({
      boundary,
      fields: [
        { name: 'rutSender', value: '12345678' },
        { name: 'dvSender', value: '5' },
        { name: 'rutCompany', value: '10000004' },
        { name: 'dvCompany', value: '0' },
      ],
      file: { name: 'archivo', fileName: 'EnvioDTE.xml', contentType: 'text/xml', bytes: everyByte },
    })
    const header = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="rutSender"',
      '',
      '12345678',
      `--${boundary}`,
      'Content-Disposition: form-data; name="dvSender"',
      '',
      '5',
      `--${boundary}`,
      'Content-Disposition: form-data; name="rutCompany"',
      '',
      '10000004',
      `--${boundary}`,
      'Content-Disposition: form-data; name="dvCompany"',
      '',
      '0',
      `--${boundary}`,
      'Content-Disposition: form-data; name="archivo"; filename="EnvioDTE.xml"',
      'Content-Type: text/xml',
      '',
      '',
    ].join('\r\n')
    const closing = `\r\n--${boundary}--\r\n`
    expect(body.length).toBe(header.length + 256 + closing.length)
    expect(decodeLatin1(body.subarray(0, header.length))).toBe(header)
    expect(Array.from(body.subarray(header.length, header.length + 256))).toEqual(Array.from(everyByte))
    expect(decodeLatin1(body.subarray(header.length + 256))).toBe(closing)
    const framing = [...body.subarray(0, header.length), ...body.subarray(header.length + 256)]
    expect(framing.every((byte) => byte < 0x80)).toBe(true)
  })

  test('the file part is not re-encoded: 0xE1 stays one byte, a UTF-8 sequence stays two', () => {
    const latin1 = buildMultipartBody({
      boundary: 'B',
      fields: [],
      file: { name: 'archivo', fileName: 'a.xml', contentType: 'text/xml', bytes: Uint8Array.of(0xe1) },
    })
    const utf8 = buildMultipartBody({
      boundary: 'B',
      fields: [],
      file: { name: 'archivo', fileName: 'a.xml', contentType: 'text/xml', bytes: Uint8Array.of(0xc3, 0xa1) },
    })
    const closingLength = '\r\n--B--\r\n'.length
    expect(utf8.length - latin1.length).toBe(1)
    expect(Array.from(latin1.subarray(-closingLength - 1, -closingLength))).toEqual([0xe1])
    expect(Array.from(utf8.subarray(-closingLength - 2, -closingLength))).toEqual([0xc3, 0xa1])
  })

  test('a boundary found in the file or in a field would corrupt the body, so it is refused', () => {
    const boundary = '----WebKitFormBoundaryAbCdEfGhIjKlMnOp'
    const file = (text: string) => ({
      name: 'archivo',
      fileName: 'EnvioDTE.xml',
      contentType: 'text/xml',
      bytes: encodeLatin1(text),
    })
    const refused = (build: () => unknown): DteError => {
      try {
        build()
      } catch (error) {
        return error as DteError
      }
      throw new Error('expected buildMultipartBody to throw')
    }
    const inFile = refused(() => buildMultipartBody({ boundary, fields: [], file: file(`<a>x--${boundary}</a>`) }))
    expect(inFile).toBeInstanceOf(DteError)
    expect(inFile.code).toBe('INVALID_OPTION')
    expect(inFile.details).toEqual({ field: 'boundary' })
    expect(inFile.message).not.toContain(boundary)
    const inField = refused(() =>
      buildMultipartBody({ boundary, fields: [{ name: 'rutSender', value: boundary }], file: file('<a/>') }),
    )
    expect(inField.code).toBe('INVALID_OPTION')
    expect(inField.details).toEqual({ field: 'boundary' })
    expect(() =>
      buildMultipartBody({ boundary, fields: [{ name: 'rutSender', value: '1' }], file: file('<a/>') }),
    ).not.toThrow()
  })
})

describe('buildMultipartParts', () => {
  test('keeps the parts in the given order, a file first when asked, and frames every part the same way', () => {
    const body = buildMultipartParts({
      boundary: 'B',
      parts: [
        {
          name: 'Filedata',
          fileName: 'muestra.pdf',
          contentType: 'application/octet-stream',
          bytes: encodeLatin1('%PDF'),
        },
        { name: 'id', value: '264872' },
        { name: 'ambiente', value: 'false' },
      ],
    })
    expect(decodeLatin1(body)).toBe(
      [
        '--B',
        'Content-Disposition: form-data; name="Filedata"; filename="muestra.pdf"',
        'Content-Type: application/octet-stream',
        '',
        '%PDF',
        '--B',
        'Content-Disposition: form-data; name="id"',
        '',
        '264872',
        '--B',
        'Content-Disposition: form-data; name="ambiente"',
        '',
        'false',
        '--B--',
        '',
      ].join('\r\n'),
    )
  })

  test('a CR, LF or quote in a name, file name or content type is refused: it would break the part header', () => {
    const bytes = encodeLatin1('x')
    const build = (part: Parameters<typeof buildMultipartParts>[0]['parts'][number]) => () =>
      buildMultipartParts({ boundary: 'B', parts: [part] })
    expect(build({ name: 'f', fileName: 'a"; name="b', contentType: 'text/plain', bytes })).toThrow(DteError)
    expect(build({ name: 'f', fileName: 'a.pdf', contentType: 'text/plain\r\nX: y', bytes })).toThrow(DteError)
    expect(build({ name: 'id\n', value: '1' })).toThrow(DteError)
    expect(build({ name: 'f', fileName: 'B', contentType: 'text/plain', bytes })).toThrow(DteError)
  })

  test('no parts gives the closing line alone, and a boundary inside a part is refused', () => {
    expect(decodeLatin1(buildMultipartParts({ boundary: 'B', parts: [] }))).toBe('--B--\r\n')
    expect(() =>
      buildMultipartParts({
        boundary: 'B',
        parts: [{ name: 'f', fileName: 'x', contentType: 'text/plain', bytes: encodeLatin1('--B--') }],
      }),
    ).toThrow(DteError)
  })
})
