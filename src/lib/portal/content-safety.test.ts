import { describe, expect, it } from 'vitest'
import type { ParsedContent } from './frontmatter'
import { assertClientSafeContent, findContentSafetyFindings } from './content-safety'

function content(overrides: Partial<ParsedContent> = {}): ParsedContent {
  return {
    portal_kind: 'content',
    content_id: 'piece',
    client: 'kanset',
    title: 'Safe title',
    producer: null,
    calendar_note: null,
    format: 'carousel',
    pillar: 'employer',
    platforms: ['instagram'],
    scheduled_date: null,
    status: 'draft',
    canva_url: 'https://www.canva.com/design/abc',
    drive_url: 'https://drive.google.com/file/d/abc/view',
    version: 1,
    fact_check: 'confirmed',
    fact_check_scope: 'required',
    fact_check_exemption: null,
    fact_check_ledger: [{
      claim_key: 'claim',
      claim: 'A public immigration claim.',
      status: 'confirmed',
      source_url: 'https://www.canada.ca/example',
      source_title: 'Government source',
      checked_at: '2026-07-18',
      checked_by_role: 'agency_fact_checker',
      source_type: 'primary_source',
    }],
    client_body: 'Book a consultation at kanset.com/contact or call +1 (647) 748-4022.',
    copy_blocks: [{ key: 'caption', label: 'Caption', body: 'Safe caption.' }],
    internal_notes: 'private@example.com UCI: 1234-5678',
    source_path: 'content/piece.md',
    ...overrides,
  }
}

describe('client content safety', () => {
  it('allows exact public Kanset contacts, reviewed link hosts, and ignores the internal section', () => {
    expect(findContentSafetyFindings(content({
      client_body: [
        'Book at kanset.com/contact or call +1 (647) 748-4022.',
        'Follow @kansetimmigration. RCIC #508325.',
        'Video by @loftcreativespace.',
        'Facebook: facebook.com/kansetimmigration.',
        'LinkedIn: linkedin.com/company/kanset-services.',
      ].join('\n'),
    }))).toEqual([])
    expect(findContentSafetyFindings(content({
      client_body: 'Call (647) 748-4022.',
    }))).toEqual([])
  })

  it('rejects unknown emails and phones without including their values in the error', () => {
    const unsafe = content({ client_body: 'Email person@example.com or call 416-555-0199.' })
    expect(findContentSafetyFindings(unsafe)).toEqual([
      { code: 'unknown_email', field: 'client_body' },
      { code: 'unknown_phone', field: 'client_body' },
    ])
    let message = ''
    try { assertClientSafeContent(unsafe, 'content/piece.md') } catch (error) { message = String(error) }
    expect(message).toContain('unknown_email')
    expect(message).not.toContain('person@example.com')
    expect(message).not.toContain('416-555-0199')
  })

  it('rejects case identifiers and raw email headers', () => {
    expect(findContentSafetyFindings(content({ client_body: 'UCI: 1234-5678' }))).toContainEqual({ code: 'case_identifier', field: 'client_body' })
    expect(findContentSafetyFindings(content({ client_body: 'From: Client Name\nSubject: My application' }))).toContainEqual({ code: 'raw_email_header', field: 'client_body' })
  })

  it('rejects unknown handles and RCIC numbers while allowing the reviewed identities', () => {
    expect(findContentSafetyFindings(content({
      client_body: 'Follow @anotherfirm. RCIC #123456.',
    }))).toEqual([
      { code: 'unknown_social_handle', field: 'client_body' },
      { code: 'unknown_regulatory_identifier', field: 'client_body' },
    ])
    expect(findContentSafetyFindings(content({
      client_body: 'Follow @kansetimmigration. RCIC #508325.',
    }))).toEqual([])
    expect(findContentSafetyFindings(content({
      client_body: 'Follow /@anotherfirm.',
    }))).toEqual([{ code: 'unknown_social_handle', field: 'client_body' }])
  })

  it('rejects unreviewed and lookalike client-visible domains', () => {
    expect(findContentSafetyFindings(content({
      client_body: 'Read https://example.com and https://evilkanset.com.',
    }))).toEqual([
      { code: 'unsafe_link', field: 'client_body' },
      { code: 'unsafe_link', field: 'client_body' },
    ])
    expect(findContentSafetyFindings(content({
      client_body: 'Private contact: maria@kanset.com.',
    }))).toEqual([{ code: 'unknown_email', field: 'client_body' }])
    expect(findContentSafetyFindings(content({
      client_body: 'Watch youtube.com/@CitImmCanada.',
    }))).toEqual([])
  })

  it('allows official Canada citations in article copy while rejecting lookalike hosts', () => {
    expect(findContentSafetyFindings(content({
      platforms: ['squarespace'],
      format: 'website_article',
      client_body: [
        'Read the [IRCC guidance](https://www.canada.ca/en/immigration-refugees-citizenship.html).',
        'Check the [application status tool](https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=022).',
      ].join('\n'),
    }))).toEqual([])
    expect(findContentSafetyFindings(content({
      platforms: ['squarespace'],
      format: 'website_article',
      client_body: 'Do not trust https://evilcanada.ca/immigration or https://canada.ca.evil.example.',
    }))).toEqual([
      { code: 'unsafe_link', field: 'client_body' },
      { code: 'unsafe_link', field: 'client_body' },
    ])
  })

  it('uses the primary-source policy, not the copy-link policy, for ledger evidence', () => {
    const safe = content()
    safe.fact_check_ledger[0].source_title = 'Ontario.ca program update'
    expect(findContentSafetyFindings(safe)).toEqual([])
  })

  it('does not misclassify dotted prose and filenames as bare-domain links', () => {
    expect(findContentSafetyFindings(content({
      client_body: 'The implementation uses Node.js; see the internal name guide.md.',
    }))).toEqual([])
  })

  it('permits public fee copy but rejects invoice-adjacent amounts', () => {
    expect(findContentSafetyFindings(content({ client_body: 'The public application fee is $1,000.' }))).toEqual([])
    expect(findContentSafetyFindings(content({ client_body: 'Invoice amount due: $1,000.' }))).toContainEqual({ code: 'private_financial_context', field: 'client_body' })
  })

  it('rejects control markers if they survive into projected fields', () => {
    expect(findContentSafetyFindings(content({ title: '<!-- internal --> private' }))).toContainEqual({ code: 'control_marker', field: 'title' })
  })

  it('validates field-specific Canva and Drive HTTPS hosts without fetching them', () => {
    expect(findContentSafetyFindings(content({ canva_url: 'javascript:alert(1)' }))).toContainEqual({ code: 'unsafe_link', field: 'canva_url' })
    expect(findContentSafetyFindings(content({ canva_url: 'https://evilcanva.com/design/x' }))).toContainEqual({ code: 'unsafe_link', field: 'canva_url' })
    expect(findContentSafetyFindings(content({ drive_url: 'https://user:pass@drive.google.com/x' }))).toContainEqual({ code: 'unsafe_link', field: 'drive_url' })
    expect(findContentSafetyFindings(content({ drive_url: 'https://docs.google.com/document/d/abc' }))).toEqual([])
  })

  it('scans copy labels/bodies and fact-check display fields', () => {
    const unsafe = content({
      copy_blocks: [{ key: 'caption', label: 'Caption', body: 'Call 905-555-0199.' }],
      fact_check_exemption: 'Email private@example.com for case details.',
    })
    expect(findContentSafetyFindings(unsafe)).toEqual(expect.arrayContaining([
      { code: 'unknown_phone', field: 'copy_blocks.caption.body' },
      { code: 'unknown_email', field: 'fact_check_exemption' },
    ]))
  })
})
