import { describe, expect, it } from 'vitest'
import { diffWords, tokenize } from './text-diff'

describe('diffWords', () => {
  it('tokenises words and the spaces between them', () => {
    expect(tokenize('a  b\nc')).toEqual(['a', '  ', 'b', '\n', 'c'])
  })

  it('marks a replaced word as removed then added', () => {
    expect(diffWords('a b c', 'a x c')).toEqual([
      { op: 'equal', text: 'a ' }, { op: 'delete', text: 'b' }, { op: 'insert', text: 'x' }, { op: 'equal', text: ' c' },
    ])
  })

  it('returns one equal run for identical text and handles empties', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ op: 'equal', text: 'same text' }])
    expect(diffWords('', 'new')).toEqual([{ op: 'insert', text: 'new' }])
    expect(diffWords('old', '')).toEqual([{ op: 'delete', text: 'old' }])
  })

  it('falls back to one removal and one addition when the middle is too large to compare word by word', () => {
    const a = Array.from({ length: 2100 }, (_, i) => `a${i}`).join(' ')
    const b = Array.from({ length: 2100 }, (_, i) => `b${i}`).join(' ')
    const ops = diffWords(a, b)
    expect(ops.map((op) => op.op)).toEqual(['delete', 'insert'])
  })
})
