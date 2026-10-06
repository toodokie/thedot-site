import { describe, expect, it } from 'vitest'
import { optionChoices, reviewAssetOptionArgs } from './review-asset-options'

// 0098: portal-write review-asset carries optionGroup + optionLabel to set_content_review_asset.
describe('reviewAssetOptionArgs', () => {
  it('passes nothing for a fixed asset, so the old 14-argument call is unchanged', () => {
    expect(reviewAssetOptionArgs({})).toEqual({})
    expect(reviewAssetOptionArgs({ optionGroup: null, optionLabel: null })).toEqual({})
  })

  it('passes a group key and a trimmed label together', () => {
    expect(reviewAssetOptionArgs({ optionGroup: 'youtube-test-3', optionLabel: ' Rust ' }))
      .toEqual({ p_option_group: 'youtube-test-3', p_option_label: 'Rust' })
  })

  it('refuses one without the other, a bad key, and a long or multi-line label', () => {
    expect(() => reviewAssetOptionArgs({ optionGroup: 'social-cover' })).toThrow(/together/)
    expect(() => reviewAssetOptionArgs({ optionLabel: 'Teal' })).toThrow(/together/)
    expect(() => reviewAssetOptionArgs({ optionGroup: 'Social Cover', optionLabel: 'Teal' })).toThrow(/optionGroup/)
    expect(() => reviewAssetOptionArgs({ optionGroup: 'social-cover', optionLabel: 'x'.repeat(81) })).toThrow(/optionLabel/)
    expect(() => reviewAssetOptionArgs({ optionGroup: 'social-cover', optionLabel: 'Teal\nRust' })).toThrow(/optionLabel/)
  })
})

describe('optionChoices', () => {
  const asset = (asset_key: string, label: string, option_group: string | null, option_label: string | null) =>
    ({ asset_key, label, option_group, option_label })
  const assets = [
    asset('youtube-cover', 'Test cover 1', null, null),
    asset('youtube-cover-test-3-rust', 'Test cover 3, option A: rust', 'youtube-test-3', 'Rust'),
    asset('youtube-cover-test-3-teal', 'Test cover 3, option B: teal', 'youtube-test-3', 'Teal'),
    asset('social-cover', 'Reel cover, option A: teal', 'social-cover', 'Teal'),
    asset('social-cover-rust', 'Reel cover, option B: rust', 'social-cover', 'Rust'),
  ]

  it('lists each group with its options and the pick, ignoring fixed assets', () => {
    expect(optionChoices(assets, [{ option_group: 'youtube-test-3', asset_key: 'youtube-cover-test-3-teal' }])).toEqual([
      { group: 'social-cover', options: [
        { assetKey: 'social-cover', label: 'Reel cover, option A: teal', optionLabel: 'Teal' },
        { assetKey: 'social-cover-rust', label: 'Reel cover, option B: rust', optionLabel: 'Rust' }], chosen: null },
      { group: 'youtube-test-3', options: [
        { assetKey: 'youtube-cover-test-3-rust', label: 'Test cover 3, option A: rust', optionLabel: 'Rust' },
        { assetKey: 'youtube-cover-test-3-teal', label: 'Test cover 3, option B: teal', optionLabel: 'Teal' }],
      chosen: { assetKey: 'youtube-cover-test-3-teal', label: 'Test cover 3, option B: teal', optionLabel: 'Teal' } },
    ])
  })

  it('ignores a pick whose asset is no longer an option in that group', () => {
    const choices = optionChoices(assets, [{ option_group: 'social-cover', asset_key: 'youtube-cover' }])
    expect(choices.find((c) => c.group === 'social-cover')?.chosen).toBeNull()
  })
})
