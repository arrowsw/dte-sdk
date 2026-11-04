import { encodeGwtLong, gwtAnswer } from '../../src/portal/gwt'
import {
  reviewId,
  reviewSentAt,
  reviewState,
  sampleDetails,
  summarizeSampleDetails,
} from '../../src/portal/pages/samples'
import { detailAnswer, EMPTY_OK, okAnswer } from '../support/gwt-answers'

test('the review state quoted in the body, with or without the accent', () => {
  expect(reviewState('//OK[1,["x","INGRESO"],0,7]')).toBe('INGRESO')
  expect(reviewState('//OK[1,["En revisión"],0,7]')).toBe('EN REVISION')
  expect(reviewState('//OK[1,["EN REVISION"],0,7]')).toBe('EN REVISION')
  expect(reviewState('//OK[1,["enviado al sii"],0,7]')).toBe('ENVIADO AL SII')
  expect(reviewState('//OK[1,["RECHAZADO"],0,7]')).toBe('RECHAZADO')
  expect(reviewState('//OK[1,["3"],0,7]')).toBeNull()
  expect(reviewState("//OK[1,'APROBADO',[],0,7]")).toBeNull()
})

test('the review id: the first Long in range, with its token; the verifier digit is never one', () => {
  const answer = gwtAnswer(
    `//OK[1,'D',2,'${encodeGwtLong(264872)}',3,'${encodeGwtLong(99)}',["2026-11-04 10:15:00","3"],0,7]`,
  )
  expect(reviewId(answer)).toEqual({ id: 264872, token: 'BAqo' })
  expect(reviewSentAt(answer)).toBe('2026-11-04 10:15:00')
  expect(reviewId(gwtAnswer(EMPTY_OK))).toBeNull()
  expect(reviewSentAt(gwtAnswer(okAnswer([1], ['3', 'INGRESO'])))).toBeNull()
  expect(reviewId(gwtAnswer(`//OK[1,'${encodeGwtLong(99999999)}',[],0,7]`))).toBeNull()
})

test('the rejection detail: rows with a PDF, the kind, the copy and the case', () => {
  const answer = detailAnswer([
    ['Archivo', 'Tipo', 'Documento', 'Folio', 'Copia', 'Caso'],
    ['1', 'muestra_33_1.pdf', 'PRUEBA', 'FACTURA ELECTRONICA', '1', 'ORIGINAL', '4256-1'],
    ['2', 'muestra_33_1_cedible.pdf', 'PRUEBA', 'FACTURA ELECTRONICA', '1', 'CEDIBLE', '4256-1'],
    ['3', 'muestra_61_7.pdf', 'SIMULACION', 'NOTA DE CREDITO', '7', 'ORIGINAL', ''],
    ['4', 'muestra_56_2.pdf', 'SIMULACION', 'NOTA DE DEBITO', '2', 'ORIGINAL'],
    ['5', 'readme.txt', 'PRUEBA', 'x', '1', 'ORIGINAL', ''],
  ])
  const rows = sampleDetails(answer)
  expect(rows).toEqual([
    {
      fileName: 'muestra_33_1.pdf',
      kind: 'test',
      documentType: 'FACTURA ELECTRONICA',
      folio: 1,
      copy: 'ORIGINAL',
      caseId: '4256-1',
    },
    {
      fileName: 'muestra_33_1_cedible.pdf',
      kind: 'test',
      documentType: 'FACTURA ELECTRONICA',
      folio: 1,
      copy: 'CEDIBLE',
      caseId: '4256-1',
    },
    {
      fileName: 'muestra_61_7.pdf',
      kind: 'simulation',
      documentType: 'NOTA DE CREDITO',
      folio: 7,
      copy: 'ORIGINAL',
      caseId: null,
    },
    {
      fileName: 'muestra_56_2.pdf',
      kind: 'simulation',
      documentType: 'NOTA DE DEBITO',
      folio: 2,
      copy: 'ORIGINAL',
      caseId: null,
    },
  ])
  expect(summarizeSampleDetails(rows)).toBe(
    'The SII recognised 1 document(s) as the test set (cases 4256-1: FACTURA ELECTRONICA 1) and 2 as the simulation (NOTA DE CREDITO 1, NOTA DE DEBITO 1). A set missing from the cases was not the envelope the SII registered for it.',
  )
  const onlyTests = rows.filter((row) => row.kind === 'test').map((row) => ({ ...row, caseId: null }))
  expect(summarizeSampleDetails(onlyTests)).toBe(
    'The SII recognised 1 document(s) as the test set (cases none: FACTURA ELECTRONICA 1) and 0 as the simulation (none). A set missing from the cases was not the envelope the SII registered for it.',
  )
  expect(summarizeSampleDetails(rows.filter((row) => row.kind === 'simulation'))).toBe(
    'The SII recognised 0 document(s) as the test set (cases none: none) and 2 as the simulation (NOTA DE CREDITO 1, NOTA DE DEBITO 1). A set missing from the cases was not the envelope the SII registered for it.',
  )
  expect(summarizeSampleDetails([])).toBe(
    'The SII recognised 0 document(s) as the test set (cases none: none) and 0 as the simulation (none). A set missing from the cases was not the envelope the SII registered for it.',
  )
})

test('the detail as plain html with escapes, and no detail at all', () => {
  const plain = `//OK[1,["<html><table><tr><td>1</td><td>a \\"b\\" \\'c\\' \\\\ \\u00e9.pdf</td><td>PRUEBA</td><td>T</td><td>5</td><td>ORIGINAL</td><td>&nbsp;</td></tr></table></html>"],0,7]`
  expect(sampleDetails(plain)).toEqual([
    { fileName: 'a "b" \'c\' \\ é.pdf', kind: 'test', documentType: 'T', folio: 5, copy: 'ORIGINAL', caseId: null },
  ])
  expect(sampleDetails(EMPTY_OK)).toEqual([])
  expect(sampleDetails(detailAnswer([]))).toEqual([])
  expect(sampleDetails('//OK[1,["sin tabla"],0,7]')).toEqual([])
})
