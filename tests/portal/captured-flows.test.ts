// The stamping, annulment and reobtention flows over a fake portal that serves the pages of the SII certification
// environment (tests/fixtures/portal/) as the bytes the portal sends.
import { annulFolios } from '../../src/portal/annulment'
import type { FakeReply, FakeRoute } from '../support/fake-sii'
import { capturedBytes, capturedPage } from '../support/captured-pages'
import { MAULLIN, signedIn } from '../support/portal'
import { page } from '../support/portal-pages'

const HTML = { 'content-type': 'text/html' }
const served = (name: string): FakeReply => ({ headers: HTML, body: capturedBytes(name) })
const get = (name: string, reply: FakeReply): FakeRoute => ({ url: `${MAULLIN}/${name}`, method: 'GET', reply })
const post = (name: string, ...replies: readonly FakeReply[]): FakeRoute => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST',
  reply: replies.length === 1 ? replies[0] : [...replies],
})

describe('annulment', () => {
  const listing = [get('af_anular1', served('af_anular1')), post('af_anular2', served('af_anular2'))]
  const annul = (range: { readonly from: number; readonly to: number }, routes: readonly FakeRoute[]) =>
    signedIn([...listing, ...routes]).then(async (harness) => ({
      harness,
      result: await annulFolios(harness.portal, { type: 33, range }),
    }))

  test('folio 114 is annulled through the form of its range, as the SII did on 2026-11-07', async () => {
    const { harness, result } = await annul({ from: 114, to: 114 }, [
      post('af_anular3', served('af_anular3-114')),
      post('af_anular', served('af_anular-ok')),
    ])
    expect(result).toMatchObject({ annulled: [{ from: 114, to: 114, count: 1 }], rejected: [], totalAnnulled: 1 })
    expect(result.knownAnnulled).toEqual(['114-114'])
    expect(harness.posted('af_anular3')[0]).toMatchObject({ FOLIO_INI: '114', FOLIO_FIN: '114', DIA: '07' })
    expect(harness.posted('af_anular')).toEqual([
      expect.objectContaining({
        RUT_EMP: '76543210',
        DV_EMP: '3',
        COD_DOCTO: '33',
        FOLIO_INI: '114',
        FOLIO_INI_A: '114',
        FOLIO_FIN_A: '114',
        MOTIVO: 'Folios no utilizados',
      }),
    ])
  })

  test('an answer in no known words is unknown, not received: the sentence every page carries is no answer', async () => {
    const { harness, result } = await annul({ from: 109, to: 113 }, [
      post('af_anular3', served('af_anular3')),
      post('af_anular', served('af_anular3')),
    ])
    expect(result.rejected).toEqual([{ from: 109, to: 113, count: 5, reason: 'unknown' }])
    expect(result.knownAnnulled).toEqual([])
    // Nothing goes folio by folio: the SII did not say any of them was taken.
    expect(harness.posted('af_anular')).toHaveLength(1)
  })

  test('a single folio the SII says it received keeps that answer and is not sent again', async () => {
    const { harness, result } = await annul({ from: 114, to: 114 }, [
      post('af_anular3', served('af_anular3-114')),
      post('af_anular', served('af_anular-recepcionado')),
    ])
    expect(result.rejected).toEqual([{ from: 114, to: 114, count: 1, reason: 'received' }])
    expect(result.knownAnnulled).toEqual(['114-114'])
    expect(harness.posted('af_anular')).toHaveLength(1)
  })

  test('a range that conflicts goes folio by folio, and only final answers are remembered', async () => {
    const { harness, result } = await annul({ from: 109, to: 113 }, [
      post('af_anular3', served('af_anular3')),
      post(
        'af_anular',
        served('af_anular-recepcionado'),
        served('af_anular-ok'),
        served('af_anular-recepcionado'),
        served('af_anular1'),
        served('af_anular-ok'),
        served('af_anular-ok'),
      ),
    ])
    expect(result.annulled).toEqual([
      { from: 109, to: 109, count: 1 },
      { from: 112, to: 112, count: 1 },
      { from: 113, to: 113, count: 1 },
    ])
    expect(result.rejected).toEqual([
      { from: 110, to: 110, count: 1, reason: 'received' },
      { from: 111, to: 111, count: 1, reason: 'unknown' },
    ])
    expect(result.knownAnnulled).toEqual(['109-109', '110-110', '112-112', '113-113'])
    expect(harness.posted('af_anular').map((fields) => fields.FOLIO_INI_A)).toEqual([
      '109',
      '109',
      '110',
      '111',
      '112',
      '113',
    ])
  })

  test('a range annulled before: the folios the page lists are, and the page says nothing of the others', async () => {
    const same = await annul({ from: 114, to: 114 }, [post('af_anular3', served('af_anular3-ya-anulado'))])
    expect(same.result.rejected).toEqual([{ from: 114, to: 114, count: 1, reason: 'alreadyAnnulled' }])
    expect(same.result.knownAnnulled).toEqual(['114-114'])
    expect(same.harness.posted('af_anular')).toEqual([])
    // The page names folio 114 only: for 109 to 113 it is no answer at all.
    const other = await annul({ from: 109, to: 113 }, [post('af_anular3', served('af_anular3-ya-anulado'))])
    expect(other.result.rejected).toEqual([{ from: 109, to: 113, count: 5, reason: 'unknown' }])
    expect(other.result.knownAnnulled).toEqual([])
  })

  test('a range annulled before in part is split by the folios the page lists', async () => {
    const before = page(
      '<p>El rango de folios que ha seleccionado, ha sido anulado anteriormente.</p><table><tr><td>Folio Inicial Anulado</td><td>110</td></tr><tr><td>Folio Final Anulado</td><td>111</td></tr></table>',
    )
    const { result } = await annul({ from: 109, to: 113 }, [post('af_anular3', { body: before })])
    expect(result.rejected).toEqual([
      { from: 109, to: 109, count: 1, reason: 'unknown' },
      { from: 110, to: 111, count: 2, reason: 'alreadyAnnulled' },
      { from: 112, to: 113, count: 2, reason: 'unknown' },
    ])
    expect(result.knownAnnulled).toEqual(['110-111'])
    expect(capturedPage('af_anular3-ya-anulado')).toContain('Folio Inicial Anulado')
  })
})
