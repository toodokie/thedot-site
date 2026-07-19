import { describe, expect, it } from 'vitest'
import { parseContentFile } from './frontmatter'

const requiredLedger = `fact_check: confirmed
fact_check_scope: required
fact_check_ledger:
  - claim_key: oinp-job-offer
    claim: "OINP Employer Job Offer streams require an eligible Ontario job offer."
    status: confirmed
    source_url: https://www.ontario.ca/page/oinp-employer-job-offer-streams
    source_title: "OINP Employer Job Offer streams"
    checked_at: "2026-07-18"
    checked_by_role: agency_fact_checker`

function document(frontmatter = '', body = 'Client copy.'): string {
  return `---
portal_kind: content
content_id: test-piece
client: kanset
title: "Test piece"
format: carousel
platforms: [instagram, facebook]
status: draft
version: 1
${requiredLedger}
${frontmatter}
---
<!-- portal-block:caption -->
## Caption
${body}

<!-- internal -->
Internal only.`
}

describe('parseContentFile', () => {
  it('parses keyed copy, strict dates, internal notes, and a required fact-check ledger', () => {
    const parsed = parseContentFile(document('scheduled_date: "2026-07-16"'), 'content/test.md')
    expect(parsed.portal_kind).toBe('content')
    expect(parsed.scheduled_date).toBe('2026-07-16')
    expect(parsed.copy_blocks).toEqual([{ key: 'caption', label: 'Caption', body: 'Client copy.' }])
    expect(parsed.client_body).not.toContain('portal-block:')
    expect(parsed.client_body).not.toContain('Internal only')
    expect(parsed.internal_notes).toBe('Internal only.')
    expect(parsed.fact_check_scope).toBe('required')
    expect(parsed.fact_check_ledger).toEqual([
      {
        claim_key: 'oinp-job-offer',
        claim: 'OINP Employer Job Offer streams require an eligible Ontario job offer.',
        status: 'confirmed',
        source_url: 'https://www.ontario.ca/page/oinp-employer-job-offer-streams',
        source_title: 'OINP Employer Job Offer streams',
        checked_at: '2026-07-18',
        checked_by_role: 'agency_fact_checker',
        source_type: 'primary_source',
      },
    ])
  })

  it('accepts explicit not-applicable creative work without a fake citation', () => {
    const raw = document().replace(requiredLedger, `fact_check: confirmed
fact_check_scope: not_applicable
fact_check_exemption: "Brand-only announcement with no factual claim."
fact_check_ledger: []`)
    const parsed = parseContentFile(raw, 'content/brand.md')
    expect(parsed.fact_check_scope).toBe('not_applicable')
    expect(parsed.fact_check_exemption).toContain('Brand-only')
    expect(parsed.fact_check_ledger).toEqual([])
  })

  it('requires portal_kind content and explicit fact-check fields', () => {
    expect(() => parseContentFile(document().replace('portal_kind: content\n', ''), 'p.md')).toThrow(/portal_kind/)
    expect(() => parseContentFile(document().replace('portal_kind: content', 'portal_kind: knowledge'), 'p.md')).toThrow(/portal_kind/)
    expect(() => parseContentFile(document().replace('fact_check: confirmed\n', ''), 'p.md')).toThrow(/fact_check/)
    expect(() => parseContentFile(document().replace('fact_check_scope: required\n', ''), 'p.md')).toThrow(/fact_check_scope/)
  })

  it('enforces required versus not-applicable scope cardinality and exemption rules', () => {
    expect(() => parseContentFile(document().replace(/fact_check_ledger:[\s\S]*?checked_by_role: agency_fact_checker/, 'fact_check_ledger: []'), 'p.md')).toThrow(/at least one/)
    expect(() => parseContentFile(document('fact_check_exemption: "This should not be present."'), 'p.md')).toThrow(/not allowed/)
    const missingExemption = document().replace(requiredLedger, 'fact_check: confirmed\nfact_check_scope: not_applicable\nfact_check_ledger: []')
    expect(() => parseContentFile(missingExemption, 'p.md')).toThrow(/requires fact_check_exemption/)
    const ledgerWithExemption = document().replace('fact_check_scope: required', 'fact_check_scope: not_applicable\nfact_check_exemption: "No factual claims in this post."')
    expect(() => parseContentFile(ledgerWithExemption, 'p.md')).toThrow(/empty ledger/)
  })

  it('allows unresolved entries to sync but requires sources for confirmed entries', () => {
    const unresolved = document().replace('status: confirmed\n    source_url: https://www.ontario.ca/page/oinp-employer-job-offer-streams\n    source_title: "OINP Employer Job Offer streams"', 'status: needs-confirm')
    expect(parseContentFile(unresolved, 'p.md').fact_check_ledger[0].status).toBe('needs-confirm')
    const noSource = document().replace('    source_url: https://www.ontario.ca/page/oinp-employer-job-offer-streams\n    source_title: "OINP Employer Job Offer streams"\n', '')
    expect(() => parseContentFile(noSource, 'p.md')).toThrow(/confirmed ledger entries require/)
  })

  it('accepts owner attestations without weakening primary-source citations', () => {
    const attested = document()
      .replace('status: confirmed\n    source_url: https://www.ontario.ca/page/oinp-employer-job-offer-streams\n    source_title: "OINP Employer Job Offer streams"', 'status: confirmed\n    source_type: agency_attested\n    source_url: null\n    source_title: "Agency owner verified the client-approved success story"')
      .replace('checked_by_role: agency_fact_checker', 'checked_by_role: agency_owner')
    expect(parseContentFile(attested, 'p.md').fact_check_ledger[0]).toMatchObject({
      source_type: 'agency_attested',
      source_url: null,
      checked_by_role: 'agency_owner',
    })
    expect(() => parseContentFile(
      attested.replace('checked_by_role: agency_owner', 'checked_by_role: agency_fact_checker'),
      'p.md',
    )).toThrow(/agency_owner/)
    expect(() => parseContentFile(
      attested.replace('source_url: null', 'source_url: https://www.ontario.ca/page/x'),
      'p.md',
    )).toThrow(/must not include source_url/)
  })

  it('rejects duplicate, invalid, unknown, and wrongly typed ledger fields', () => {
    const duplicate = document().replace('    checked_by_role: agency_fact_checker', `    checked_by_role: agency_fact_checker
  - claim_key: oinp-job-offer
    claim: "Duplicate"
    status: needs-confirm
    checked_at: "2026-07-18"
    checked_by_role: agency_owner`)
    expect(() => parseContentFile(duplicate, 'p.md')).toThrow(/Duplicate claim_key/)
    expect(() => parseContentFile(document().replace('claim_key: oinp-job-offer', 'claim_key: Bad Key'), 'p.md')).toThrow(/claim_key/)
    expect(() => parseContentFile(document().replace('    claim:', '    internal_reasoning: secret\n    claim:'), 'p.md')).toThrow(/Unknown fact_check_ledger key/)
    expect(() => parseContentFile(document().replace('fact_check_ledger:', 'fact_check_ledger: nope\nignored:'), 'p.md')).toThrow(/fact_check_ledger/)
  })

  it('rejects unsafe, credentialed, and lookalike primary-source URLs', () => {
    const replaceUrl = (url: string) => document().replace('https://www.ontario.ca/page/oinp-employer-job-offer-streams', url)
    expect(() => parseContentFile(replaceUrl('http://ontario.ca/page/x'), 'p.md')).toThrow(/HTTPS/)
    expect(() => parseContentFile(replaceUrl('https://user:pass@ontario.ca/page/x'), 'p.md')).toThrow(/credentials/)
    expect(() => parseContentFile(replaceUrl('https://evilontario.ca/page/x'), 'p.md')).toThrow(/approved primary source/)
    expect(() => parseContentFile(replaceUrl('https://gc.ca/page/x'), 'p.md')).toThrow(/approved primary source/)
    expect(() => parseContentFile(replaceUrl('https://alberta.ca/page/x'), 'p.md')).toThrow(/approved primary source/)
    expect(() => parseContentFile(replaceUrl('//ontario.ca/page/x'), 'p.md')).toThrow(/HTTPS/)
  })

  it('accepts real subdomains but not suffix lookalikes', () => {
    const canada = document().replace('https://www.ontario.ca/page/oinp-employer-job-offer-streams', 'https://www.canada.ca/en/immigration-refugees-citizenship.html')
    expect(parseContentFile(canada, 'p.md').fact_check_ledger[0].source_url).toContain('www.canada.ca')
    const ircc = document().replace('https://www.ontario.ca/page/oinp-employer-job-offer-streams', 'https://ircc.canada.ca/page/x')
    expect(parseContentFile(ircc, 'p.md').fact_check_ledger[0].source_url).toBe('https://ircc.canada.ca/page/x')
  })

  it('rejects invalid, future, and unquoted checked dates', () => {
    expect(() => parseContentFile(document().replace('checked_at: "2026-07-18"', 'checked_at: "2026-02-31"'), 'p.md')).toThrow(/checked_at/)
    expect(() => parseContentFile(document().replace('checked_at: "2026-07-18"', 'checked_at: "2999-01-01"'), 'p.md')).toThrow(/future/)
    expect(() => parseContentFile(document().replace('checked_at: "2026-07-18"', 'checked_at: 2026-07-18'), 'p.md')).toThrow(/quoted/)
  })

  it('rejects missing IDs, bad status/version/platform types, and unsafe schedule dates', () => {
    expect(() => parseContentFile(document().replace('content_id: test-piece\n', ''), 'p.md')).toThrow(/content_id/)
    expect(() => parseContentFile(document().replace('status: draft', 'status: bogus'), 'p.md')).toThrow(/status/)
    expect(() => parseContentFile(document().replace('version: 1', 'version: 0'), 'p.md')).toThrow(/version/)
    expect(() => parseContentFile(document().replace('platforms: [instagram, facebook]', 'platforms: instagram'), 'p.md')).toThrow(/platforms/)
    expect(() => parseContentFile(document('scheduled_date: 2026-07-16'), 'p.md')).toThrow(/quoted/)
    expect(() => parseContentFile(document('scheduled_date: "2026-02-31"'), 'p.md')).toThrow(/scheduled_date/)
  })

  it('requires exactly one internal marker and non-empty keyed client copy', () => {
    expect(() => parseContentFile(document().replace('\n<!-- internal -->\nInternal only.', ''), 'p.md')).toThrow(/marker/)
    expect(() => parseContentFile(document().replace('Internal only.', 'Internal.\n<!-- internal -->\nAgain.'), 'p.md')).toThrow(/marker/)
    expect(() => parseContentFile(document('', ''), 'p.md')).toThrow(/body must not be empty/)
  })

  it('rejects unkeyed/duplicate copy blocks and preserves CRLF separation', () => {
    expect(() => parseContentFile(document().replace('<!-- portal-block:caption -->\n', ''), 'p.md')).toThrow(/portal-block key/)
    const duplicate = document().replace('\n<!-- internal -->', '\n<!-- portal-block:caption -->\n## Again\nMore.\n\n<!-- internal -->')
    expect(() => parseContentFile(duplicate, 'p.md')).toThrow(/Duplicate portal block key/)
    const parsed = parseContentFile(document().replaceAll('\n', '\r\n'), 'windows.md')
    expect(parsed.copy_blocks[0].body).toBe('Client copy.')
    expect(parsed.client_body).not.toContain('Internal only')
  })

  it('rejects coercion and bounded-field violations', () => {
    expect(() => parseContentFile(document().replace('title: "Test piece"', 'title: 123'), 'p.md')).toThrow(/title/)
    expect(() => parseContentFile(document().replace('claim: "OINP Employer Job Offer streams require an eligible Ontario job offer."', `claim: "${'x'.repeat(501)}"`), 'p.md')).toThrow(/claim/)
    const badExemption = document().replace(requiredLedger, 'fact_check: confirmed\nfact_check_scope: not_applicable\nfact_check_exemption: short\nfact_check_ledger: []')
    expect(() => parseContentFile(badExemption, 'p.md')).toThrow(/10-300/)
  })
})
