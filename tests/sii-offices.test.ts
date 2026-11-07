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

  test('the table: 40 offices, 355 communes, each in one office and written in its normal form', () => {
    const offices = Object.keys(SII_OFFICES)
    const communes = Object.values(SII_OFFICES).flat()
    expect(offices).toHaveLength(40)
    expect(communes).toHaveLength(355)
    expect(new Set(communes).size).toBe(communes.length)
    for (const office of offices) expect(office).toMatch(/^S\.I\.I\. - [A-ZÁÉÍÓÚÑ ]+$/)
    for (const commune of communes) {
      expect(commune).toMatch(/^[a-z][a-z '-]*[a-z]$/)
      expect(siiOfficeForCommune(commune)).toBe(offices.find((office) => SII_OFFICES[office].includes(commune)))
    }
  })

  // The official communes the office directory left out, each with the office of the SII unit that serves it.
  test.each([
    ['S.I.I. - LA SERENA', ['Canela', 'Los Vilos', 'Combarbalá', 'Monte Patria', 'Punitaqui', 'Río Hurtado']],
    ['S.I.I. - SAN FELIPE', ['Llay-Llay', 'Santa María']],
    ['S.I.I. - SANTIAGO PONIENTE', ['María Pinto']],
    [
      'S.I.I. - RANCAGUA',
      [
        'Las Cabras',
        'Mostazal',
        'Peumo',
        'Pichidegua',
        'San Vicente',
        'La Estrella',
        'Litueche',
        'Marchihue',
        'Paredones',
        'Chépica',
        'Chimbarongo',
        'Lolol',
        'Nancagua',
        'Palmilla',
        'Peralillo',
        'Placilla',
        'Pumanque',
      ],
    ],
    ['S.I.I. - TALCA', ['Chanco', 'Pelluhue', 'Colbún', 'Retiro', 'Villa Alegre', 'Yerbas Buenas']],
    ['S.I.I. - CHILLÁN', ['Treguaco']],
    ['S.I.I. - TALCAHUANO', ['Talcahuano', 'Hualpén']],
    ['S.I.I. - CONCEPCIÓN', ['Contulmo']],
    ['S.I.I. - TEMUCO', ['Saavedra', 'Renaico']],
    ['S.I.I. - PANGUIPULLI', ['Panguipulli']],
    ['S.I.I. - PUERTO MONTT', ['Curaco de Vélez', 'Puqueldón', 'Queilén', 'Quemchi', 'Quinchao']],
    ['S.I.I. - CHAITÉN', ['Chaitén', 'Futaleufú', 'Palena']],
    ['S.I.I. - COYHAIQUE', ["O'Higgins"]],
    ['S.I.I. - PUNTA ARENAS', ['Antártica']],
  ])('%s serves %j', (office, communes) => {
    for (const commune of communes) expect([commune, siiOfficeForCommune(commune)]).toEqual([commune, office])
  })

  test('an official spelling and the variant the table had give the same office', () => {
    for (const [official, variant] of [
      ['Llay-Llay', 'Llay Llay'],
      ['Treguaco', 'Trehuaco'],
      ['Mostazal', 'San Francisco de Mostazal'],
      ['Saavedra', 'Puerto Saavedra'],
    ])
      expect(siiOfficeForCommune(official)).toBe(siiOfficeForCommune(variant))
  })
})
