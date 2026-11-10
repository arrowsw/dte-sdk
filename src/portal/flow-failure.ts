import type { PortalRejection } from '../catalogs/portal'
import type { DteError, DteErrorCode } from '../errors'
import { redactText } from '../sii/capture'
import type { PortalContext } from './session'

/**
 * EN: The `DteError` that stopped a folio flow already holding something the caller must not lose: CAFs, or folios the
 * SII has annulled. Only its code is kept, with the kind of a refusal, since its other details may carry what a page
 * said; those go to the logger.
 * ES: El `DteError` que detuvo un flujo de folios que ya tenía algo que quien llama no puede perder: CAF, o folios que el
 * SII anuló. Solo se guarda su código, con el tipo de un rechazo, porque sus otros detalles pueden traer lo que dijo una
 * página; esos van al logger.
 */
export type FolioFlowFailure = {
  /** EN: The error code. ES: El código del error. */
  readonly code: DteErrorCode
  /** EN: The step that failed. Reading the quota or listing ranges changes nothing; a request may have been granted all the same, and `listReobtainableRanges` says whether it was; an annulment may have gone through, and the next one hears it from the SII as "already annulled". ES: El paso que falló. Leer el cupo o listar rangos no cambia nada; una solicitud pudo otorgarse igual, y `listReobtainableRanges` dice si se otorgó; una anulación pudo pasar, y la siguiente lo sabe por el SII como "ya anulado". */
  readonly operation: 'queryFolioQuota' | 'requestCaf' | 'reobtainCaf' | 'listFolioRanges' | 'annulFolios'
  /** EN: The kind of refusal when `code` is `SII_PORTAL_REJECTED`, as a listing the SII refuses after an annulment; absent otherwise. ES: El tipo de rechazo cuando `code` es `SII_PORTAL_REJECTED`, como un listado que el SII rechaza después de una anulación; ausente si no. */
  readonly rejection?: PortalRejection
}

/**
 * EN: The failure of a flow that keeps what it holds: the original error goes to the logger whole, each text detail
 * with its secrets redacted, and the result keeps its code.
 * ES: La falla de un flujo que conserva lo que tiene: el error original va completo al logger, cada detalle de texto con
 * sus secretos ocultos, y el resultado guarda su código.
 */
export const flowFailure = (
  context: PortalContext,
  error: DteError,
  operation: FolioFlowFailure['operation'],
): FolioFlowFailure => {
  const details = Object.entries(error.details).map(([key, value]) => [
    key,
    typeof value === 'string' ? redactText(value) : value,
  ])
  context.portal.logger.warn('sii portal flow stopped, keeping what it holds', {
    operation: context.operation,
    ...Object.fromEntries(details),
    code: error.code,
    stoppedAt: operation,
  })
  return error.code === 'SII_PORTAL_REJECTED'
    ? { code: error.code, operation, rejection: error.details.rejection as PortalRejection }
    : { code: error.code, operation }
}
