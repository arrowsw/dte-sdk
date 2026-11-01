import { createMemoryUploadArchive, uploadRecordName } from '../../src/sii/archive'
import { sampleRecord } from '../support/sii-samples'

describe('uploadRecordName', () => {
  test('uses the TrackID, or a timestamp for rejected uploads', () => {
    expect(uploadRecordName(sampleRecord)).toBe('1234567-dte')
    expect(uploadRecordName({ ...sampleRecord, trackId: null, kind: 'book' })).toBe('rejected-20261115183000-book')
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
