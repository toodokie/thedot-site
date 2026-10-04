import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './markdown-doc'
import { docTextMap, trackChangeRanges } from './track-changes'

describe('track changes', () => {
  it('maps document text to positions, with blank lines between blocks', () => {
    const map = docTextMap(parseMarkdown('Ab\n\nCd'))
    expect(map.text).toBe('Ab\n\nCd')
    expect(map.positions.slice(0, 2)).toEqual([1, 2])
    expect(map.positions[4]).toBe(5)
  })

  it('finds added words and removed words against the released text', () => {
    const doc = parseMarkdown('One two three')
    expect(trackChangeRanges(doc, 'One three')).toEqual({ inserts: [{ from: 5, to: 8 }], deletes: [] })
    expect(trackChangeRanges(parseMarkdown('One three'), 'One two three')).toEqual({ inserts: [], deletes: [{ at: 5, text: 'two' }] })
  })

  it('ignores formatting-only changes', () => {
    expect(trackChangeRanges(parseMarkdown('**One** two'), 'One two')).toEqual({ inserts: [], deletes: [] })
  })
})
