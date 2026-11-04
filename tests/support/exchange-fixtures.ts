// Synthetic exchange sets and the fake routes of the two GWT portals, for the step and runner tests. Every value is
// invented; the GWT answers follow the field's shapes.
import { EXCHANGE_PORTAL, SAMPLES_PORTAL, type GwtPortal } from '../../src/catalogs/certification'
import type { FakeReply, FakeRoute, RecordedRequest } from './fake-sii'
import { ISSUER_RUT, RECEIVER_RUT } from './fixtures'
import { EMPTY_OK, okAnswer } from './gwt-answers'

/** The SII issues the exchange set; the company under certification receives it. */
export const SET_ISSUER = RECEIVER_RUT
const SII_NS = 'http://www.sii.cl/SiiDte'

const exchangeDocument = (type: number, folio: number, receiver: string): string =>
  `<DTE version="1.0"><Documento ID="F${folio}T${type}"><Encabezado><IdDoc><TipoDTE>${type}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-11-0${folio}</FchEmis></IdDoc><Emisor><RUTEmisor>${SET_ISSUER}</RUTEmisor></Emisor><Receptor><RUTRecep>${receiver}</RUTRecep></Receptor><Totales><MntTotal>${folio * 1000}</MntTotal></Totales></Encabezado></Documento></DTE>`

/** An exchange set of `count` documents addressed to the company. */
export const exchangeSetXml = (count = 2): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE xmlns="${SII_NS}" version="1.0"><SetDTE ID="SetDoc"><Caratula version="1.0"><RutEmisor>${SET_ISSUER}</RutEmisor><RutEnvia>${SET_ISSUER}</RutEnvia><RutReceptor>${ISSUER_RUT}</RutReceptor><FchResol>2026-01-01</FchResol><NroResol>0</NroResol><TmstFirmaEnv>2026-11-01T10:00:00</TmstFirmaEnv></Caratula>${Array.from(
    { length: count },
    (_, index) => exchangeDocument(index === 0 ? 33 : 61, index + 1, ISSUER_RUT),
  ).join('')}</SetDTE></EnvioDTE>`

/** The method of a GWT-RPC body: the fourth string of its table. */
export const gwtMethodOf = (request: RecordedRequest): string => request.text.split('|')[6]

/** The warm-up page and the module script that confirms the known permutation. */
export const gwtWarmUpRoutes = (portal: GwtPortal): FakeRoute[] => [
  { method: 'GET', url: portal.base, reply: { body: '<html>portal</html>' } },
  {
    method: 'GET',
    url: `${portal.base}${portal.moduleName}.nocache.js`,
    reply: { body: `'${portal.known.permutation}'` },
  },
]

export const USER_TYPE = 'cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533'
/** The user validation when the company stands in an earlier stage. */
export const NOT_IN_EXCHANGE = okAnswer([0], [USER_TYPE, 'La empresa no esta en estado P06, estado: P05'])
/** The user validation once the exchange was completed. */
export const EXCHANGE_COMPLETED = okAnswer([0], [USER_TYPE, 'La empresa no esta en estado P06, estado: P90'])
export const REFUSED_UPLOAD =
  '<html><head><title>ERROR</title></head><body>no vienen los parametros necesarios</body></html>'

export type ExchangeRouteOptions = {
  /** The answer of each facade method; `EMPTY_OK` for the rest. */
  readonly facade?: Readonly<Record<string, FakeReply>>
  /** The download answer; the two-document set by default. */
  readonly download?: FakeReply
  /** The three upload answers; `ok` by default. */
  readonly uploads?: readonly FakeReply[]
}

/** The exchange portal: warm-up, hashes, the download, the three uploads and the facade. */
export const exchangeRoutes = (options: ExchangeRouteOptions = {}): FakeRoute[] => [
  ...gwtWarmUpRoutes(EXCHANGE_PORTAL),
  {
    method: 'POST',
    url: `${EXCHANGE_PORTAL.base}downloadFile*`,
    reply: options.download ?? { body: exchangeSetXml() },
  },
  ...[1, 2, 3].map(
    (n): FakeRoute => ({
      method: 'POST',
      url: `${EXCHANGE_PORTAL.base}uploadFile${n}*`,
      reply: options.uploads?.[n - 1] ?? { body: `ok${n}` },
    }),
  ),
  {
    method: 'POST',
    url: `${EXCHANGE_PORTAL.base}facade`,
    reply: (request) => options.facade?.[gwtMethodOf(request)] ?? { body: EMPTY_OK },
  },
]

export const SAMPLES_SERVICE_URL = `${SAMPLES_PORTAL.base}ServicePdfDte`
export const SAMPLES_UPLOAD_URL = `${SAMPLES_PORTAL.base}upload`
export const REVIEW_TOKEN = 'BAqo'
export const REVIEW_ID = 264872

/** A `leeImpreso` answer with a state, the review token and the date sent. */
export const reviewAnswer = (state: string, token = REVIEW_TOKEN): string =>
  `//OK[7,6,'${token}',5,4,["java.util.ArrayList/4159755760","cl.sii.sdi.dim.validaPdfDte.to.ImpresoTo/1","${state}","2026-11-01 10:20","3"],0,7]`
/** A `creaLista` answer with the review token. */
export const CREATED_REVIEW = okAnswer([`'${REVIEW_TOKEN}'`], ['cl.sii.sdi.dim.validaPdfDte.to.ListaTo/1'])
/** A `leeImpreso` answer that names no state: the application is not in the printed samples stage. */
export const SAMPLES_BLOCKED = okAnswer(
  [0],
  ['cl.sii.sdi.dim.validaPdfDte.to.ImpresoTo/1', "El estado de la postulacion NO es: 'DOCUMENTOS IMPRESOS'"],
)

export type SamplesRouteOptions = {
  /** The answer of each service method, or a function of the call number for `leeImpreso`. */
  readonly service?: Readonly<Record<string, FakeReply | ((call: number) => FakeReply)>>
  /** The upload answers in order, the last one repeated; `ok` by default. */
  readonly uploads?: readonly FakeReply[]
}

/** The samples portal: warm-up, hashes, the service and the upload. Each method counts its own calls. */
export const samplesRoutes = (options: SamplesRouteOptions = {}): FakeRoute[] => {
  const calls = new Map<string, number>()
  const uploads = { count: 0 }
  return [
    ...gwtWarmUpRoutes(SAMPLES_PORTAL),
    {
      method: 'POST',
      url: SAMPLES_SERVICE_URL,
      reply: (request) => {
        const method = gwtMethodOf(request)
        const call = (calls.get(method) ?? 0) + 1
        calls.set(method, call)
        const answer = options.service?.[method]
        if (answer === undefined) return { body: EMPTY_OK }
        return typeof answer === 'function' ? answer(call) : answer
      },
    },
    {
      method: 'POST',
      url: SAMPLES_UPLOAD_URL,
      reply: () => {
        uploads.count += 1
        const replies = options.uploads ?? [{ body: 'ok' }]
        return replies[Math.min(uploads.count, replies.length) - 1]
      },
    },
  ]
}
