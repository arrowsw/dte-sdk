import { unstable_createAssignment } from '../../src/assignment/build'
import { readAssignmentFile, standalone, unstable_verifyAssignment } from '../../src/assignment/read'
import { DteError } from '../../src/errors'
import { signEnveloped } from '../../src/signature/xmldsig'
import { parseXmlDom } from '../../src/xml/parse'
import { certificateOf, firstAssignment, issuerParty } from '../support/assignment-fixtures'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { certificate } from '../support/printed-fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(60_000)

const file = unstable_createAssignment(firstAssignment())
const twoSigners = unstable_createAssignment(
  firstAssignment({
    assignor: {
      ...issuerParty,
      signers: [
        { rut: ISSUER_RUT, name: 'Carolina Valdés Rojas' },
        { rut: RECEIVER_RUT, name: 'Pedro Soto', certificate: certificateOf(RECEIVER_RUT) },
      ],
    },
  }),
)

const caught = (run: () => unknown): DteError => {
  try {
    run()
  } catch (error) {
    if (error instanceof DteError) return error
    throw error
  }
  throw new Error('expected a DteError')
}

const replaced = (xml: string, from: string | RegExp, to: string): string => {
  const next = xml.replace(from, to)
  if (next === xml) throw new Error(`nothing replaced: ${String(from)}`)
  return next
}

describe('readAssignmentFile', () => {
  test('cuts each zone from the file as it came', () => {
    const read = readAssignmentFile(file)
    expect(read.root.tagName).toBe('AEC')
    expect(file).toContain(read.document.text)
    expect(file).toContain(read.assignedDocument.text)
    expect(read.assignments).toHaveLength(1)
    expect(file).toContain(read.assignments[0].text)
    expect(read.assignedDocument.text.startsWith('<DTECedido xmlns="http://www.sii.cl/SiiDte" version="1.0">')).toBe(
      true,
    )
  })

  test('writes on a zone the declarations it inherits, and only those', () => {
    const dom = parseXmlDom(
      '<a xmlns="urn:a" xmlns:p="urn:p&quot;"><b xmlns:p="urn:q"><c xmlns:r="urn:r">t</c></b></a>',
    )
    const c = dom.getElementsByTagName('c')[0]
    expect(standalone(c, '<c xmlns:r="urn:r">t</c>')).toBe('<c xmlns="urn:a" xmlns:p="urn:q" xmlns:r="urn:r">t</c>')
    const a = dom.documentElement
    expect(standalone(a, '<a>x</a>')).toBe('<a>x</a>')
    const inherited = readAssignmentFile(file.replace('<DTECedido xmlns="http://www.sii.cl/SiiDte" ', '<DTECedido '))
    expect(inherited.assignedDocument.text.startsWith('<DTECedido xmlns="http://www.sii.cl/SiiDte" version')).toBe(true)
  })

  test.each([
    ['a DOCTYPE', file.replace('<AEC ', '<!DOCTYPE AEC><AEC '), 'DOCTYPE'],
    ['another root', '<DTE xmlns="http://www.sii.cl/SiiDte"/>', 'AEC'],
    ['an AEC outside the SII namespace', file.replace('<AEC xmlns="http://www.sii.cl/SiiDte"', '<AEC'), 'AEC'],
    ['no DocumentoAEC', '<AEC xmlns="http://www.sii.cl/SiiDte"/>', 'DocumentoAEC'],
    [
      'a prefixed DTECedido',
      file.replace(/<(\/?)DTECedido/g, '<$1s:DTECedido').replace('<AEC ', '<AEC xmlns:s="http://www.sii.cl/SiiDte" '),
      'DTECedido',
    ],
    ['no Cesion', file.replace(/<Cesion [\s\S]*<\/Cesion>/, ''), 'Cesion'],
    ['two DTE in the assigned zone', file.replace('</DTE><TmstFirma>', '</DTE><DTE/><TmstFirma>'), 'DTE'],
    ['a Cesion in a comment', file.replace('<Cesiones>', '<Cesiones><!--<Cesion x></Cesion>-->'), 'Cesion'],
    ['a DTECedido in a comment', file.replace('<Cesiones>', '<Cesiones><!--<DTECedido></DTECedido>-->'), 'DTECedido'],
  ])('refuses %s', (_name, xml, field) => {
    expect(caught(() => readAssignmentFile(xml))).toMatchObject({ code: 'XML_PARSE_FAILED', details: { field } })
  })
})

describe('unstable_verifyAssignment', () => {
  test('one verification per signature, the assignment`s in the signers` order', () => {
    const verification = unstable_verifyAssignment(twoSigners)
    expect(verification.valid).toBe(true)
    expect(verification.assignments).toEqual([
      [
        { referenceId: 'Cesion_T33F7_1', digestValid: true, signatureValid: true, valid: true },
        { referenceId: 'Cesion_T33F7_1', digestValid: true, signatureValid: true, valid: true },
      ],
    ])
  })

  test('a change in any zone fails that zone and the whole file', () => {
    const document = unstable_verifyAssignment(
      replaced(file, '<MntTotal>254363</MntTotal></Totales>', '<MntTotal>1</MntTotal></Totales>'),
    )
    expect([document.document.valid, document.assignedDocument.valid, document.file.valid, document.valid]).toEqual([
      false,
      false,
      false,
      false,
    ])
    const assignment = unstable_verifyAssignment(replaced(file, '<MontoCesion>254363', '<MontoCesion>254362'))
    expect([assignment.document.valid, assignment.assignments[0][0].valid, assignment.file.valid]).toEqual([
      true,
      false,
      false,
    ])
    // The second signer's value swapped for the document's: only that signature fails.
    const values = Array.from(twoSigners.matchAll(/<SignatureValue>([^<]*)<\/SignatureValue>/g), (m) => m[1])
    const at = twoSigners.lastIndexOf(values[3])
    const swapped = `${twoSigners.slice(0, at)}${values[0]}${twoSigners.slice(at + values[3].length)}`
    expect(unstable_verifyAssignment(swapped).assignments[0].map((signature) => signature.valid)).toEqual([true, false])
  })

  test('a namespace the root adds changes what every zone covers there, and none verifies', () => {
    const added = unstable_verifyAssignment(
      replaced(file, '<AEC xmlns="http://www.sii.cl/SiiDte"', '<AEC xmlns="http://www.sii.cl/SiiDte" xmlns:x="urn:x"'),
    )
    expect([
      added.document.valid,
      added.assignedDocument.valid,
      added.assignments[0][0].valid,
      added.file.valid,
    ]).toEqual([false, false, false, false])
  })

  test.each([
    [
      'without its signature',
      (xml: string) => xml.replace(/(<\/DocumentoCesion>)<Signature[\s\S]*?<\/Signature>/, '$1'),
      'SIGNATURE_NOT_FOUND',
      'Cesion',
    ],
    [
      'with a prefixed signature',
      (xml: string) =>
        xml.replace(/(<\/DocumentoCesion>)<Signature xmlns=/, '$1<ds:Signature xmlns:ds="urn:x"/><Signature xmlns='),
      'XML_PARSE_FAILED',
      'Signature',
    ],
    [
      'with an empty DocumentoCesion',
      (xml: string) => xml.replace(/<DocumentoCesion [\s\S]*<\/DocumentoCesion>/, '<DocumentoCesion ID="x"/>'),
      'XML_PARSE_FAILED',
      'DocumentoCesion',
    ],
  ])('refuses an assignment %s', (_name, edit, code, field) => {
    expect(caught(() => unstable_verifyAssignment(edit(file)))).toMatchObject({ code, details: { field } })
  })
})

describe('the signatures of an assignment are its children', () => {
  // The file signed again over an edited `Cesion`, so its own signature is no reason to refuse it.
  const fileWith = (edit: (xml: string) => string): string => {
    const edited = edit(file)
    const at = edited.lastIndexOf('<Signature xmlns=')
    return signEnveloped({
      xml: `${edited.slice(0, at)}</AEC>`,
      elementTag: 'DocumentoAEC',
      rootTag: 'AEC',
      certificate,
    }).xml
  }

  test('one inside another element is not a signature of the assignment, and the schema says so too', async () => {
    const wrapped = fileWith((xml) =>
      replaced(xml, /(<\/DocumentoCesion>)(<Signature[\s\S]*?<\/Signature>)/, '$1<Extra>$2</Extra>'),
    )
    expect(caught(() => unstable_verifyAssignment(wrapped))).toMatchObject({
      code: 'XML_PARSE_FAILED',
      details: { field: 'Signature' },
    })
    expect((await validateAgainstXsd(wrapped, 'AEC')).join('\n')).toContain("Element '{http://www.sii.cl/SiiDte}Extra'")
  })

  test('nor is an element of that name in the namespace of the file', () => {
    const renamed = fileWith((xml) =>
      replaced(
        xml,
        /(<\/DocumentoCesion>)<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/,
        '$1<Signature>',
      ),
    )
    expect(caught(() => unstable_verifyAssignment(renamed))).toMatchObject({
      code: 'XML_PARSE_FAILED',
      details: { field: 'Signature' },
    })
  })
})

describe('the schema of the file', () => {
  test('says what is wrong in a file that breaks it', async () => {
    const errors = await validateAgainstXsd(
      replaced(file, '<TipoDTE>33</TipoDTE><RUTEmisor>', '<TipoDTE>52</TipoDTE><RUTEmisor>'),
      'AEC',
    )
    expect(errors).toEqual([
      expect.stringContaining("Element '{http://www.sii.cl/SiiDte}TipoDTE': [facet 'enumeration']"),
    ])
    const unsigned = await validateAgainstXsd(`${file.slice(0, file.lastIndexOf('<Signature xmlns='))}</AEC>`, 'AEC')
    expect(unsigned.length).toBeGreaterThan(0)
  })
})
