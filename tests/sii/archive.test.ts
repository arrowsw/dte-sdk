import { createMemoryUploadArchive, uploadRecordName } from '../../src/sii/archive'
import { sampleRecord } from '../support/sii-samples'

describe('uploadRecordName', () => {
  test('uses the TrackID, or a timestamp for rejected uploads', () => {
    expect(uploadRecordName(sampleRecord)).toBe('1234567-dte')
    expect(uploadRecordName({ ...sampleRecord, trackId: null, kind: 'book' })).toBe('rejected-20261115183000-book')
  })

  test('a duplicate answer gets its own name, so it cannot overwrite the record of the original upload', () => {
    expect(uploadRecordName({ ...sampleRecord, duplicate: true })).toBe('1234567-dte-duplicate-20261115183000')
    expect(
      uploadRecordName({
        ...sampleRecord,
        duplicate: true,
        kind: 'folioConsumption',
        sentAt: '2026-12-01T00:00:09.250Z',
      }),
    ).toBe('1234567-folioConsumption-duplicate-20261201000009')
    expect(uploadRecordName({ ...sampleRecord, duplicate: true })).not.toBe(uploadRecordName(sampleRecord))
  })
})

describe('createMemoryUploadArchive', () => {
  test('stores records and returns copies', async () => {
    const memory = createMemoryUploadArchive()
    await memory.archive(sampleRecord)
    const first = memory.records()
    await memory.archive({ ...sampleRecord, trackId: '2' })
    expect(first).toHaveLength(1)
    expect(memory.records().map((r) => r.trackId)).toEqual(['1234567', '2'])
  })
})
