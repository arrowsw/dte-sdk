import type { HttpRequest, HttpResponse, HttpTransport } from '../../src/sii/transport'
import { decodeLatin1, encodeLatin1 } from '../../src/text/latin1'

/** A scripted reply: a response description, or an Error the transport throws. */
export type FakeReply =
  | {
      readonly status?: number
      readonly headers?: Readonly<Record<string, string>>
      readonly body?: string | Uint8Array
      readonly encoding?: 'latin1' | 'utf8'
    }
  | Error

export type MultipartPart = {
  readonly name: string
  readonly fileName: string | null
  readonly contentType: string | null
  readonly value: string
}

export type RecordedRequest = {
  readonly method: string
  readonly url: string
  /** Lower-cased header names. */
  readonly headers: Readonly<Record<string, string>>
  readonly body: Uint8Array | null
  /** The per-request timeout the client asked for, ms. */
  readonly timeoutMs: number
  /** Body decoded as Latin-1 (lossless one char per byte). */
  readonly text: string
  /** Parsed multipart parts when the request is `multipart/form-data`, else `[]`. */
  readonly parts: readonly MultipartPart[]
}

export type FakeRoute = {
  readonly method?: 'GET' | 'POST'
  /** Exact URL, a prefix ending in `*`, or a RegExp. */
  readonly url: string | RegExp
  /** One reply, a function of the request, or a queue consumed in order. */
  readonly reply: FakeReply | FakeReply[] | ((request: RecordedRequest) => FakeReply)
}

export type FakeSii = {
  readonly transport: HttpTransport
  readonly requests: RecordedRequest[]
  /** Replies still queued across every route. */
  readonly pending: () => number
}

export const parseMultipart = (text: string, contentType: string): readonly MultipartPart[] => {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1]
  if (boundary === undefined) return []
  return text
    .split(`--${boundary}`)
    .slice(1)
    .filter((chunk) => !chunk.startsWith('--'))
    .map((chunk) => {
      const [rawHeaders, ...rest] = chunk.replace(/^\r\n/, '').split('\r\n\r\n')
      return {
        name: /name="([^"]*)"/.exec(rawHeaders)?.[1] ?? '',
        fileName: /filename="([^"]*)"/.exec(rawHeaders)?.[1] ?? null,
        contentType: /Content-Type: ([^\r\n]+)/i.exec(rawHeaders)?.[1] ?? null,
        value: rest.join('\r\n\r\n').replace(/\r\n$/, ''),
      }
    })
}

const lowerKeys = (headers: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))

const record = (request: HttpRequest): RecordedRequest => {
  const headers = lowerKeys(request.headers)
  const text = request.body === undefined ? '' : decodeLatin1(request.body)
  const contentType = headers['content-type'] ?? ''
  return {
    method: request.method,
    url: request.url,
    headers,
    body: request.body ?? null,
    timeoutMs: request.timeoutMs,
    text,
    parts: contentType.startsWith('multipart/form-data') ? parseMultipart(text, contentType) : [],
  }
}

const matches = (route: FakeRoute, request: HttpRequest): boolean => {
  if (route.method !== undefined && route.method !== request.method) return false
  if (route.url instanceof RegExp) return route.url.test(request.url)
  return route.url.endsWith('*') ? request.url.startsWith(route.url.slice(0, -1)) : request.url === route.url
}

const toResponse = (reply: Exclude<FakeReply, Error>): HttpResponse => {
  const body = reply.body ?? ''
  const bytes =
    typeof body === 'string' ? (reply.encoding === 'utf8' ? new TextEncoder().encode(body) : encodeLatin1(body)) : body
  return { status: reply.status ?? 200, headers: lowerKeys(reply.headers ?? {}), body: bytes }
}

/** A fake SII: routes map URLs to scripted replies; every request is recorded for assertions. */
export const createFakeSii = (routes: readonly FakeRoute[]): FakeSii => {
  const requests: RecordedRequest[] = []
  const queues = new Map<FakeRoute, FakeReply[]>()
  const next = (route: FakeRoute, request: RecordedRequest): FakeReply => {
    if (typeof route.reply === 'function') return route.reply(request)
    if (Array.isArray(route.reply)) {
      const queue = queues.get(route) ?? [...route.reply]
      queues.set(route, queue)
      const reply = queue.shift()
      if (reply === undefined) throw new Error(`fake SII: no replies left for ${request.method} ${request.url}`)
      return reply
    }
    return route.reply as FakeReply
  }
  const transport: HttpTransport = async (request) => {
    const recorded = record(request)
    requests.push(recorded)
    const route = routes.find((candidate) => matches(candidate, request))
    if (route === undefined) throw new Error(`fake SII: no route for ${request.method} ${request.url}`)
    const reply = next(route, recorded)
    if (reply instanceof Error) throw reply
    return toResponse(reply)
  }
  return {
    transport,
    requests,
    pending: () => Array.from(queues.values()).reduce((sum, queue) => sum + queue.length, 0),
  }
}
