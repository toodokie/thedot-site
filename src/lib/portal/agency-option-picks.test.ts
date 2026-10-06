import { describe, expect, it } from 'vitest'
import { getAgencyOptionChoices, optionChoiceLine } from './agency-option-picks'

function fakeAdmin(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain, eq: () => chain, not: () => chain,
        order: () => chain,
        then: (resolve: (value: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null }),
      }
      return chain
    },
  } as never
}

describe('getAgencyOptionChoices (0098)', () => {
  it('returns each group with the latest pick and who made it', async () => {
    const admin = fakeAdmin({
      content_review_assets: [
        { asset_key: 'youtube-cover-test-3-rust', label: 'Test cover 3, option A: rust', option_group: 'youtube-test-3', option_label: 'Rust' },
        { asset_key: 'youtube-cover-test-3-teal', label: 'Test cover 3, option B: teal', option_group: 'youtube-test-3', option_label: 'Teal' },
        { asset_key: 'social-cover', label: 'Reel cover, option A: teal', option_group: 'social-cover', option_label: 'Teal' },
      ],
      content_review_option_picks: [
        { auth_user_id: 'u1', option_group: 'youtube-test-3', asset_key: 'youtube-cover-test-3-teal', picked_at: '2026-10-06T20:00:00Z' },
      ],
    })
    const choices = await getAgencyOptionChoices(admin, { clientId: 'c', contentItemId: 'i', contentVersion: 2,
      seatNames: new Map([['u1', 'Maria Guerts']]) })
    expect(choices.map(optionChoiceLine)).toEqual([
      'social-cover: not chosen yet (Teal)',
      'youtube-test-3: Teal (Test cover 3, option B: teal), chosen by Maria Guerts 2026-10-06 20:00 UTC',
    ])
  })
})
