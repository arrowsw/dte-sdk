// The portal pages of `tests/fixtures/portal/`: the folio pages of the SII certification environment, captured on
// 2026-11-06 and 2026-11-07 with fictitious data, and a few reconstructed by hand. The first line of each says which.
// They are Latin-1 bytes, as the old portal serves them.
import { readdirSync, readFileSync } from 'node:fs'
import { fixturePath } from './fixtures'

/** The bytes of a page, as the SII sends them; a name without an extension is an `.html` page. */
export const capturedBytes = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fixturePath(`portal/${name}${name.includes('.') ? '' : '.html'}`)))

/** A page decoded the way the portal client decodes the old portal: Latin-1. */
export const capturedPage = (name: string): string => Buffer.from(capturedBytes(name)).toString('latin1')

/** Every page of the folder, by name without `.html`. */
export const CAPTURED_PAGE_NAMES: readonly string[] = readdirSync(fixturePath('portal'))
  .filter((name) => name.endsWith('.html'))
  .map((name) => name.replace(/\.html$/, ''))

/** Only the pages captured from the SII, not the ones reconstructed by hand. */
export const REAL_PAGE_NAMES: readonly string[] = CAPTURED_PAGE_NAMES.filter((name) =>
  capturedPage(name).startsWith('<!-- Captured'),
)
