import { describe, expect, it } from 'vitest'
import { PortalDataError } from './data'
import { parseProposalBlocks } from './proposals'

describe('proposal document parser', () => {
  it('accepts the safe structured document used by the client renderer', () => {
    expect(parseProposalBlocks([
      { kind: 'heading', title: 'Episode 2' },
      { kind: 'paragraph', body: 'A short, client-safe overview.' },
      { kind: 'checklist', title: 'Please decide', items: ['Use the gentle retouch', 'Keep all five clips'] },
      { kind: 'links', links: [{ label: 'Open design', url: 'https://www.canva.com/design/example' }] },
    ])).toHaveLength(4)
  })

  it('fails closed for incomplete blocks and unsafe link schemes', () => {
    expect(() => parseProposalBlocks([{ kind: 'checklist', items: [] }])).toThrow(PortalDataError)
    expect(() => parseProposalBlocks([{ kind: 'links', links: [{ label: 'Bad', url: 'javascript:alert(1)' }] }])).toThrow(PortalDataError)
  })
})
