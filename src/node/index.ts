/**
 * EN: dte-sdk/node entry: the adapters that need Node: the `node:https` transport with client certificates and the SII
 * legacy TLS settings, and the on-disk HTTP capture, upload archive and folio registry. They load `node:` modules on first
 * use, never at import.
 * ES: Entrada dte-sdk/node: los adaptadores que necesitan Node: el transporte `node:https` con certificado de cliente y los
 * ajustes de TLS antiguos del SII, y la captura HTTP, el archivo de envíos y el registro de folios en disco. Cargan los
 * módulos `node:` en el primer uso, nunca al importar.
 */
export { createNodeHttpsTransport } from '../sii/node-transport'
export type { NodeTlsOptions, NodeHttpsTransportOptions, TlsVersion } from '../sii/node-transport'
export { createDirectoryCapture } from '../sii/node-capture'
export type { DirectoryCaptureOptions } from '../sii/node-capture'
export { createDirectoryUploadArchive } from '../sii/node-archive'
export type { DirectoryUploadArchiveOptions } from '../sii/node-archive'
export { createDirectoryFolioRegistry } from '../folios/node-registry'
export type { DirectoryFolioRegistryOptions } from '../folios/node-registry'
