import { describe, it, expect } from 'vitest'
import { safeNext } from './redirect'

const ORIGIN = 'https://www.thedotcreative.co'

describe('safeNext', () => {
  it('allows a same-origin portal path', () => {
    expect(safeNext('/client/kanset', ORIGIN).href).toBe(`${ORIGIN}/client/kanset`)
  })
  it('allows a portal path with a query string', () => {
    expect(safeNext('/client/kanset?tab=activity', ORIGIN).href).toBe(`${ORIGIN}/client/kanset?tab=activity`)
  })
  it('falls back for the userinfo open-redirect trick (@evil.com)', () => {
    expect(safeNext('@evil.com', ORIGIN).href).toBe(`${ORIGIN}/client/kanset`)
  })
  it('falls back for a protocol-relative URL (//evil.com)', () => {
    expect(safeNext('//evil.com', ORIGIN).href).toBe(`${ORIGIN}/client/kanset`)
  })
  it('falls back for a backslash trick (/\\evil.com)', () => {
    expect(safeNext('/\\evil.com', ORIGIN).href).toBe(`${ORIGIN}/client/kanset`)
  })
  it('falls back for an absolute off-origin URL', () => {
    expect(safeNext('https://evil.com', ORIGIN).href).toBe(`${ORIGIN}/client/kanset`)
  })
  it('falls back for a same-origin NON-portal path', () => {
    expect(safeNext('/admin', ORIGIN).href).toBe(`${ORIGIN}/client/kanset`)
  })
  it('falls back for null / empty', () => {
    expect(safeNext(null, ORIGIN).href).toBe(`${ORIGIN}/client/kanset`)
    expect(safeNext('', ORIGIN).href).toBe(`${ORIGIN}/client/kanset`)
  })
})
