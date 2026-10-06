import { describe, expect, it } from 'vitest'
import { assetDestination, groupMediaByDestination, usesDestinationGroups } from './media-destinations'

type A = { asset_key: string; channel: 'social' | 'youtube' | 'website'; asset_kind: 'cover' | 'video' | 'document'; option_group?: string | null }
const a = (asset_key: string, channel: A['channel'], asset_kind: A['asset_kind'], option_group: string | null = null): A =>
  ({ asset_key, channel, asset_kind, option_group })

// The real Kanset Talks ep4 v2 package (production, read 2026-10-06).
const EP4 = [
  a('social-cover', 'social', 'cover', 'social-cover'), a('social-cover-rust', 'social', 'cover', 'social-cover'),
  a('social-teaser', 'social', 'video'), a('social-teaser-fb', 'social', 'video'),
  a('youtube-cover', 'youtube', 'cover'), a('youtube-cover-test-2', 'youtube', 'cover'),
  a('youtube-cover-test-3-rust', 'youtube', 'cover', 'youtube-test-3'), a('youtube-cover-test-3-teal', 'youtube', 'cover', 'youtube-test-3'),
]
const PODCAST = ['youtube', 'instagram', 'facebook']

describe('assetDestination', () => {
  const keys = new Set(EP4.map((x) => x.asset_key))
  it('sends youtube-channel assets to YouTube and a LinkedIn key to LinkedIn', () => {
    expect(assetDestination(a('youtube-cover-test-2', 'youtube', 'cover'), PODCAST, keys)).toBe('youtube')
    expect(assetDestination(a('linkedin-video', 'social', 'video'), ['linkedin'], new Set())).toBe('linkedin')
  })
  it('splits a social trailer from its -fb sibling: the plain one is Instagram, the -fb one Facebook', () => {
    expect(assetDestination(a('social-teaser', 'social', 'video'), PODCAST, keys)).toBe('instagram')
    expect(assetDestination(a('social-teaser-fb', 'social', 'video'), PODCAST, keys)).toBe('facebook')
    expect(assetDestination(a('reel-ig', 'social', 'video'), PODCAST, new Set())).toBe('instagram')
  })
  it('a shared social asset serves Instagram and Facebook, or the one social platform the piece posts to', () => {
    expect(assetDestination(a('social-cover', 'social', 'cover'), PODCAST, keys)).toBe('instagram-facebook')
    expect(assetDestination(a('social-cover', 'social', 'cover'), ['instagram'], new Set())).toBe('instagram')
    expect(assetDestination(a('reel', 'social', 'video'), ['linkedin'], new Set())).toBe('linkedin')
  })
  it('names the website and leaves anything unmapped as other, never hidden', () => {
    expect(assetDestination(a('website-cover', 'website', 'cover'), ['squarespace'], new Set())).toBe('website')
    expect(assetDestination({ asset_key: 'mystery', channel: 'tiktok' as never, asset_kind: 'video' }, PODCAST, new Set())).toBe('other')
  })
})

describe('groupMediaByDestination', () => {
  it('groups the ep4 package by destination, in a fixed order, videos first', () => {
    const groups = groupMediaByDestination(EP4, PODCAST)
    expect(groups.map((g) => [g.label, g.assets.map((x) => x.asset_key)])).toEqual([
      ['YouTube', ['youtube-cover', 'youtube-cover-test-2', 'youtube-cover-test-3-rust', 'youtube-cover-test-3-teal']],
      ['Instagram and Facebook', ['social-cover', 'social-cover-rust']],
      ['Instagram', ['social-teaser']],
      ['Facebook', ['social-teaser-fb']],
    ])
  })
  it('puts an unmapped asset in Other files', () => {
    const groups = groupMediaByDestination([a('x', 'tiktok' as never, 'video')], PODCAST)
    expect(groups).toEqual([{ key: 'other', label: 'Other files', assets: [expect.objectContaining({ asset_key: 'x' })] }])
  })
})

describe('usesDestinationGroups', () => {
  it('keeps a simple reel (one video, at most one cover, no options) on the single-video layout', () => {
    expect(usesDestinationGroups([a('reel-video', 'social', 'video'), a('reel-cover', 'social', 'cover')])).toBe(false)
    expect(usesDestinationGroups([a('linkedin-video', 'social', 'video'), a('linkedin-cover', 'social', 'cover')])).toBe(false)
  })
  it('groups a package with two videos, two covers or any option', () => {
    expect(usesDestinationGroups(EP4)).toBe(true)
    expect(usesDestinationGroups([a('v1', 'social', 'video'), a('v2', 'social', 'video')])).toBe(true)
    expect(usesDestinationGroups([a('reel-video', 'social', 'video'), a('c1', 'social', 'cover'), a('c2', 'youtube', 'cover')])).toBe(true)
    expect(usesDestinationGroups([a('c1', 'social', 'cover', 'g'), a('v', 'social', 'video')])).toBe(true)
  })
})
