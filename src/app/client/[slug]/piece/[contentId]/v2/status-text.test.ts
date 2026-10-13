import { describe, expect, it } from 'vitest'
import { draftStatusLine } from './status-text'

describe('draftStatusLine', () => {
  it('says this phone on a phone and this device elsewhere (plan 3, decision 6)', () => {
    expect(draftStatusLine('offline', true)).toBe('Saved on this phone · will sync when online')
    expect(draftStatusLine('offline', false)).toBe('Saved on this device · will sync when online')
  })

  it('uses the plan 3 wording for every other state', () => {
    expect(draftStatusLine('saving', false)).toBe('Saving…')
    expect(draftStatusLine('saved', true)).toBe('Saved · not sent yet')
    expect(draftStatusLine('send_failed', true)).toBe("Couldn't send. Retry")
    expect(draftStatusLine('idle', true)).toBeNull()
  })
})
