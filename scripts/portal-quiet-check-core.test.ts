import { describe, expect, it, vi } from 'vitest'
import { decidePortalQuiet } from './portal-quiet-check-core'
import { clientSeatIds, parseIncludeAll, readSignal, SIGNALS } from './portal-quiet-check'

describe('decidePortalQuiet', () => {
  it('returns quiet when every client activity signal is empty', () => {
    expect(decidePortalQuiet([
      { label: 'Review draft updates', count: 0, latestAt: null },
      { label: 'Client activity events', count: 0, latestAt: null },
    ])).toEqual({ active: false, exitCode: 0, signals: [] })
  })

  it('returns active and sorts the non-empty signals by latest activity', () => {
    const decision = decidePortalQuiet([
      { label: 'Review draft updates', count: 2, latestAt: '2026-10-15T14:00:00.000Z' },
      { label: 'Report views', count: 0, latestAt: null },
      { label: 'Client activity events', count: 1, latestAt: '2026-10-15T14:05:00.000Z' },
    ])

    expect(decision.active).toBe(true)
    expect(decision.exitCode).toBe(2)
    expect(decision.signals.map((signal) => signal.label)).toEqual([
      'Client activity events',
      'Review draft updates',
    ])
  })
})

describe('portal quiet client seat filter', () => {
  it('excludes agency and preview seats by default', () => {
    expect(clientSeatIds([
      { auth_user_id: 'client-seat', email: 'maria@example.com' },
      { auth_user_id: 'agency-seat', email: 'ops@thedotcreative.co' },
      { auth_user_id: 'preview-seat', email: 'TOODOKIE@GMAIL.COM' },
    ], false)).toEqual(['client-seat'])
  })

  it('includes every seat with --include-all', () => {
    const seats = [
      { auth_user_id: 'client-seat', email: 'maria@example.com' },
      { auth_user_id: 'agency-seat', email: 'ops@thedotcreative.co' },
      { auth_user_id: 'preview-seat', email: 'toodokie@gmail.com' },
    ]

    expect(parseIncludeAll(['--minutes', '30', '--include-all'])).toBe(true)
    expect(clientSeatIds(seats, parseIncludeAll(['--include-all']))).toEqual([
      'client-seat', 'agency-seat', 'preview-seat',
    ])
  })

  it('marks every auth-user signal, including drafts, for client-seat filtering', () => {
    expect(SIGNALS.filter((signal) => signal.hasAuthUserId).map((signal) => signal.table)).toEqual([
      'content_review_drafts',
      'portal_seen',
      'portal_report_views',
      'content_review_tab_ticks',
      'content_review_option_picks',
      'portal_feedback_responses',
      'content_review_playback_failures',
    ])
    const activityLog = SIGNALS.find((signal) => signal.table === 'activity_log')!
    expect(activityLog).toMatchObject({ actorType: 'client' })
    expect(activityLog).not.toHaveProperty('hasAuthUserId')
  })

  it('queries review drafts only for remaining client seats', async () => {
    const query = {
      select: vi.fn(),
      gte: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.gte.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.in.mockReturnValue(query)
    query.order.mockReturnValue(query)
    query.limit.mockResolvedValue({
      data: [{ updated_at: '2026-10-15T14:00:00.000Z' }], count: 1, error: null,
    })
    const supabase = { from: vi.fn(() => query) }

    await readSignal(supabase as never, SIGNALS[0]!, '2026-10-15T13:15:00.000Z', ['client-seat'])

    expect(query.in).toHaveBeenCalledWith('auth_user_id', ['client-seat'])
  })

  it('keeps the actor filter for activity_log instead of applying a seat filter', async () => {
    const query = {
      select: vi.fn(),
      gte: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.gte.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.in.mockReturnValue(query)
    query.order.mockReturnValue(query)
    query.limit.mockResolvedValue({
      data: [{ created_at: '2026-10-15T14:00:00.000Z' }], count: 1, error: null,
    })
    const supabase = { from: vi.fn(() => query) }
    const activityLog = SIGNALS.find((signal) => signal.table === 'activity_log')!

    await readSignal(supabase as never, activityLog, '2026-10-15T13:15:00.000Z', ['client-seat'])

    expect(query.eq).toHaveBeenCalledWith('actor_type', 'client')
    expect(query.in).not.toHaveBeenCalled()
  })
})
