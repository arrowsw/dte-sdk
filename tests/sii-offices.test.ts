import { SII_OFFICES, siiOfficeForCommune } from '../src/catalogs/sii-offices'

describe('the SII office of a commune', () => {
  test('a commune gives the office whose legend goes under the type box', () => {
    expect(siiOfficeForCommune('Santiago')).toBe('S.I.I. - SANTIAGO CENTRO')
    expect(siiOfficeForCommune('Las Condes')).toBe('S.I.I. - SANTIAGO ORIENTE')
    expect(siiOfficeForCommune('Providencia')).toBe('S.I.I. - PROVIDENCIA')
    expect(siiOfficeForCommune('Arica')).toBe('S.I.I. - ARICA')
    expect(siiOfficeForCommune('Puerto Williams')).toBe('S.I.I. - PUNTA ARENAS')
  })

  test('case, surrounding spaces and accents do not matter, as field behaviour lists both spellings', () => {
    expect(siiOfficeForCommune('  ÑUÑOA ')).toBe('S.I.I. - ÑUÑOA')
    expect(siiOfficeForCommune('Nunoa')).toBe('S.I.I. - ÑUÑOA')
    expect(siiOfficeForCommune('Chillán Viejo')).toBe('S.I.I. - CHILLÁN')
    expect(siiOfficeForCommune('chillan viejo')).toBe('S.I.I. - CHILLÁN')
    expect(siiOfficeForCommune('Alto Bío-Bío')).toBe('S.I.I. - LOS ÁNGELES')
    expect(siiOfficeForCommune('Alto Biobío')).toBe('S.I.I. - LOS ÁNGELES')
    expect(siiOfficeForCommune('Til-Til')).toBe('S.I.I. - SANTIAGO NORTE')
    expect(siiOfficeForCommune('Tiltil')).toBe('S.I.I. - SANTIAGO NORTE')
  })

  test('an unknown, empty or missing commune gives null', () => {
    expect(siiOfficeForCommune('Atlantis')).toBeNull()
    expect(siiOfficeForCommune('')).toBeNull()
    expect(siiOfficeForCommune('   ')).toBeNull()
    expect(siiOfficeForCommune(undefined as unknown as string)).toBeNull()
    expect(siiOfficeForCommune(42 as unknown as string)).toBeNull()
  })

  test('an inherited property name is not a commune', () => {
    expect(siiOfficeForCommune('constructor')).toBeNull()
    expect(siiOfficeForCommune('toString')).toBeNull()
  })

  test('the table: 37 offices, 306 communes, each in one office and written in its normal form', () => {
    const offices = Object.keys(SII_OFFICES)
    const communes = Object.values(SII_OFFICES).flat()
    expect(offices).toHaveLength(37)
    expect(communes).toHaveLength(306)
    expect(new Set(communes).size).toBe(communes.length)
    for (const office of offices) expect(office).toMatch(/^S\.I\.I\. - [A-ZÁÉÍÓÚÑ ]+$/)
    for (const commune of communes) {
      expect(commune).toMatch(/^[a-z][a-z -]*[a-z]$/)
      expect(siiOfficeForCommune(commune)).toBe(offices.find((office) => SII_OFFICES[office].includes(commune)))
    }
  })
})
