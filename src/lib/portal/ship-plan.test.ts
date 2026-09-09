import { describe, expect, it } from 'vitest'
import { planShip, shipOverrideReason, type ShipInput } from './ship-plan'

const baseInput = (over: Partial<ShipInput> = {}): ShipInput => ({
  contentId: 'kanset-piece',
  item: {
    status: 'draft', workingVersion: 1, clientVisibleVersion: 1, revisionInProgress: true,
    plannedDate: '2026-09-01', platforms: ['instagram', 'facebook', 'youtube'], archived: false,
  },
  requests: [
    { id: 'r1', status: 'pending', blockKey: 'social-caption', targetKind: 'copy_block', baseVersion: 1 },
    { id: 'r2', status: 'pending', blockKey: 'video-script', targetKind: 'copy_block', baseVersion: 1 },
  ],
  canonical: { exists: true, version: 1, producer: 'the_dot', scheduledDate: '2026-09-01' },
  links: [
    { destination: 'instagram', liveUrl: 'https://www.instagram.com/reel/AAA/' },
    { destination: 'facebook', liveUrl: 'https://www.facebook.com/share/r/BBB/' },
    { destination: 'youtube', liveUrl: 'https://www.youtube.com/shorts/CCC' },
  ],
  existingTargets: [],
  clientApprovedTargetVersion: false,
  ...over,
})

describe('planShip', () => {
  it('plans the whole close-out for a posted piece with open edits', () => {
    const plan = planShip(baseInput())
    expect(plan.blockers).toEqual([])
    expect(plan.targetVersion).toBe(2)
    expect(plan.reconcile).toBe('bundle')
    expect(plan.reconcileRequestIds).toEqual(['r1', 'r2'])
    expect(plan.release).toBe(true)
    expect(plan.courtesyRelease).toBe(true)
    expect(plan.overrideDestinations).toEqual(['instagram', 'facebook', 'youtube'])
  })

  it('uses the single-request path for exactly one open edit', () => {
    const plan = planShip(baseInput({ requests: [baseInput().requests[0]] }))
    expect(plan.reconcile).toBe('single')
    expect(plan.targetVersion).toBe(2)
  })

  it('skips reconciliation and release when nothing is open', () => {
    const plan = planShip(baseInput({ requests: [] }))
    expect(plan.reconcile).toBe('none')
    expect(plan.targetVersion).toBe(1)
    expect(plan.release).toBe(false)
    expect(plan.blockers).toEqual([])
  })

  it('skips the courtesy release when the client actually approved', () => {
    const plan = planShip(baseInput({ requests: [], clientApprovedTargetVersion: true }))
    expect(plan.courtesyRelease).toBe(false)
  })

  it('refuses a canonical file with no producer, before anything is committed', () => {
    const plan = planShip(baseInput({
      canonical: { exists: true, version: 1, producer: null, scheduledDate: '2026-09-01' },
    }))
    expect(plan.blockers).toContainEqual(expect.stringContaining('does not declare producer'))
  })

  it('names the shared-revision guard instead of failing halfway', () => {
    const plan = planShip(baseInput({
      requests: [
        ...baseInput().requests,
        { id: 'r3', status: 'prepared', blockKey: null, targetKind: 'asset', baseVersion: 1 },
      ],
    }))
    expect(plan.blockers).toContainEqual(expect.stringContaining('0083'))
  })

  it('refuses to reconcile anything that is not a copy edit', () => {
    const plan = planShip(baseInput({
      requests: [{ id: 'r1', status: 'pending', blockKey: null, targetKind: 'asset', baseVersion: 1 }],
    }))
    expect(plan.blockers).toContainEqual(expect.stringContaining('only copy edits'))
  })

  it('refuses a conflicted request', () => {
    const plan = planShip(baseInput({
      requests: [{ id: 'r1', status: 'conflicted', blockKey: 'social-caption', targetKind: 'copy_block', baseVersion: 1 }],
    }))
    expect(plan.blockers).toContainEqual(expect.stringContaining('conflicted'))
  })

  it('refuses a stale canonical scheduled_date', () => {
    const plan = planShip(baseInput({
      canonical: { exists: true, version: 1, producer: 'the_dot', scheduledDate: '2026-08-30' },
    }))
    expect(plan.blockers).toContainEqual(expect.stringContaining('does not match the portal planned date'))
  })

  it('refuses a non-https permalink and a duplicated destination', () => {
    const plan = planShip(baseInput({
      links: [
        { destination: 'instagram', liveUrl: 'http://insecure/' },
        { destination: 'instagram', liveUrl: 'https://www.instagram.com/reel/AAA/' },
      ],
    }))
    expect(plan.blockers).toContainEqual(expect.stringContaining('not an https URL'))
    expect(plan.blockers).toContainEqual(expect.stringContaining('supplied twice'))
  })

  it('warns rather than blocks when a destination is still missing a permalink', () => {
    const plan = planShip(baseInput({
      links: [{ destination: 'instagram', liveUrl: 'https://www.instagram.com/reel/AAA/' }],
    }))
    expect(plan.blockers).toEqual([])
    expect(plan.warnings).toContainEqual(expect.stringContaining('facebook, youtube'))
  })

  it('does not re-override a destination that already has a target on the target version', () => {
    const plan = planShip(baseInput({
      requests: [],
      existingTargets: [{ destination: 'instagram', contentVersion: 1 }],
    }))
    expect(plan.overrideDestinations).toEqual(['facebook', 'youtube'])
    expect(plan.publishDestinations).toEqual(['instagram', 'facebook', 'youtube'])
  })

  it('refuses a piece that was never released', () => {
    const plan = planShip(baseInput({
      item: { ...baseInput().item, clientVisibleVersion: null },
    }))
    expect(plan.blockers).toContainEqual(expect.stringContaining('no released version'))
  })
})

describe('shipOverrideReason', () => {
  it('carries the exact prefix both writers require', () => {
    const reason = shipOverrideReason({
      destinations: ['instagram', 'facebook'], publishedOn: '2026-09-01',
      targetVersion: 2, appliedEditCount: 2,
    })
    expect(reason.toLowerCase().startsWith('agency override authorized by anastasia:')).toBe(true)
    expect(reason).toContain('instagram, facebook')
    expect(reason).toContain('v2')
  })

  it('does not claim edits were applied when none were outstanding', () => {
    const reason = shipOverrideReason({
      destinations: ['youtube'], publishedOn: '2026-09-03', targetVersion: 1, appliedEditCount: 0,
    })
    expect(reason).toContain('No client edits were outstanding')
  })

  it('stays singular for one edit', () => {
    const reason = shipOverrideReason({
      destinations: ['youtube'], publishedOn: '2026-09-03', targetVersion: 2, appliedEditCount: 1,
    })
    expect(reason).toContain("Maria's submitted edit was applied verbatim")
  })
})
