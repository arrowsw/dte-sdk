import { rcvAppUrl, type FacadeService } from '../catalogs/portal'
import { redactText } from '../sii/capture'
import { parseRcvAnswer, type RcvObject } from './pages/rcv'
import { ensurePage, portalRequest, unexpectedPage, withFreshSessionRetry, type PortalContext } from './session'

const appUrlOf = (context: PortalContext, service: FacadeService, app: string): string =>
  rcvAppUrl(service.productionOnly === true ? 'production' : context.portal.environment, app)

/**
 * EN: Visits the entry app of a service, which leaves the token in the jar; the session handles the login it may ask for.
 * ES: Visita la app de entrada de un servicio, que deja el token en la bolsa; la sesión maneja el ingreso que pueda pedir.
 */
export const openService = async (context: PortalContext, service: FacadeService): Promise<string> => {
  const page = await ensurePage(context, service.entryApp, appUrlOf(context, service, service.entryApp))
  const { TOKEN, CSESSIONID } = context.state.cookies
  const token = TOKEN || CSESSIONID
  if (!token) throw unexpectedPage(context, 'token', page.html)
  return token
}

/**
 * EN: Posts one method of a service's facade inside the envelope its app sends, and returns the JSON object it answers.
 * ES: Envía un método de la fachada de un servicio dentro del sobre que envía su app, y devuelve el objeto JSON que responde.
 */
export const callService = async (
  context: PortalContext,
  token: string,
  service: FacadeService,
  method: string,
  data: unknown,
): Promise<RcvObject> => {
  const appUrl = appUrlOf(context, service, service.app)
  const page = await portalRequest(context, method, 'POST', `${appUrl}${service.facade}/${method}`, {
    json: {
      metaData: {
        namespace: `${service.namespace}/${method}`,
        conversationId: token,
        transactionId: service.paged ? '1' : context.portal.randomId(),
        ...(service.omitsPage === true ? {} : { page: service.paged ? { pageSize: 1, pageIndex: 1 } : null }),
      },
      data,
    },
    referer: appUrl,
  })
  const answer = parseRcvAnswer(page.html)
  if (answer === null) throw unexpectedPage(context, method, redactText(page.html))
  return answer
}

/**
 * EN: A call to one method of the facade a read was opened on.
 * ES: Una llamada a un método de la fachada sobre la que se abrió una lectura.
 */
export type ServiceCall = (method: string, data: unknown) => Promise<RcvObject>

/**
 * EN: One POST per call unless the caller opts in, while the login and the visit to the app keep their retries. A read that
 * meets an expired session or an unreadable page starts over once with a fresh session.
 * ES: Un POST por llamada salvo que quien llama lo pida, mientras el ingreso y la visita a la app mantienen sus reintentos.
 * Una lectura que encuentra una sesión vencida o una página ilegible parte de nuevo una vez con una sesión nueva.
 */
export const readService = <T>(
  context: PortalContext,
  service: FacadeService,
  read: (call: ServiceCall) => Promise<T>,
): Promise<T> =>
  withFreshSessionRetry(context, async () => {
    const token = await openService(context, service)
    const once: PortalContext = { ...context, overrides: { retry: false, ...context.overrides } }
    return read((method, data) => callService(once, token, service, method, data))
  })
