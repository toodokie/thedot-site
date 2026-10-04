import { describe, expect, it } from 'vitest'
import {
  isPlaybackErrorCode, mediaErrorCode, playbackErrorLabel, PLAYBACK_BROWSERS, PLAYBACK_DEVICES, summarizeUserAgent,
} from './playback-failure'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; en_CA)',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  pixelChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsungTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
}

describe('summarizeUserAgent', () => {
  it('names the device and browser from fixed lists', () => {
    expect(summarizeUserAgent(UA.iphoneSafari)).toEqual({ device: 'iPhone', browser: 'Safari' })
    expect(summarizeUserAgent(UA.iphoneChrome)).toEqual({ device: 'iPhone', browser: 'Chrome' })
    expect(summarizeUserAgent(UA.iphoneInstagram)).toEqual({ device: 'iPhone', browser: 'In-app browser' })
    expect(summarizeUserAgent(UA.ipad)).toEqual({ device: 'iPad', browser: 'Safari' })
    expect(summarizeUserAgent(UA.pixelChrome)).toEqual({ device: 'Android phone', browser: 'Chrome' })
    expect(summarizeUserAgent(UA.samsungTablet)).toEqual({ device: 'Android tablet', browser: 'Samsung Internet' })
    expect(summarizeUserAgent(UA.macSafari)).toEqual({ device: 'Mac', browser: 'Safari' })
    expect(summarizeUserAgent(UA.windowsEdge)).toEqual({ device: 'Windows PC', browser: 'Edge' })
    expect(summarizeUserAgent(UA.linuxFirefox)).toEqual({ device: 'Linux PC', browser: 'Firefox' })
  })

  it('never returns anything outside the lists the database accepts', () => {
    expect(summarizeUserAgent(null)).toEqual({ device: 'Other device', browser: 'Other browser' })
    expect(summarizeUserAgent('curl/8.6.0')).toEqual({ device: 'Other device', browser: 'Other browser' })
    for (const ua of Object.values(UA)) {
      const { device, browser } = summarizeUserAgent(ua)
      expect(PLAYBACK_DEVICES).toContain(device)
      expect(PLAYBACK_BROWSERS).toContain(browser)
    }
  })
})

describe('error codes', () => {
  it('maps HTMLMediaElement error codes', () => {
    expect([1, 2, 3, 4, 9, undefined, null].map((code) => mediaErrorCode(code))).toEqual([
      'media_err_aborted', 'media_err_network', 'media_err_decode', 'media_err_src_not_supported',
      'unknown', 'unknown', 'unknown',
    ])
  })

  it('knows its own codes and labels them in plain words', () => {
    expect(isPlaybackErrorCode('stalled')).toBe(true)
    expect(isPlaybackErrorCode('drop table')).toBe(false)
    expect(playbackErrorLabel('link_expired')).toBe('signed link expired')
    expect(playbackErrorLabel('media_err_network')).toBe('network error')
    expect(playbackErrorLabel('something_new')).toBe('something new')
  })
})
