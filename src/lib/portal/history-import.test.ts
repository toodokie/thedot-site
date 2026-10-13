import { describe, expect, it } from 'vitest'
import { parseHistoryMappings, parsePostedHistoryMarkdown } from './history-import'

describe('historical publication import parsing', () => {
  it('extracts only dated timeline rows', () => {
    const rows = parsePostedHistoryMarkdown(`
| Date | Piece | Format | Pillar | Producer | Destinations + import provenance |
|---|---|---|---|---|---|
| 2026-07-07 | Synthetic article | Article | News | The Dot | Website: \`kanset.com/news/test\` |
`)
    expect(rows).toEqual([{ date: '2026-07-07', piece: 'Synthetic article', format: 'Article',
      pillar: 'News', producer: 'The Dot', provenanceText: 'Website: `kanset.com/news/test`' }])
  })

  it('requires explicit content IDs, destinations, timestamps, and provenance', () => {
    expect(() => parseHistoryMappings({ entries: [{ piece: 'A', destinations: [] }] })).toThrow(/Incomplete/)
    expect(parseHistoryMappings({ entries: [{ piece: 'A', content_id: 'a', destinations: [{
      destination: 'instagram', published_at: '2026-07-07T16:00:00-04:00',
      provenance: 'legacy_unverified',
    }] }] })).toHaveLength(1)
  })
})
