import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquirePieceLock } from './update-portal-lock'

describe('acquirePieceLock', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'up-lock-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('a second concurrent acquire on the same piece is refused (Codex B2)', () => {
    const first = acquirePieceLock('piece-a', { dir })
    expect(() => acquirePieceLock('piece-a', { dir })).toThrow(/another update-portal run holds the lock/)
    first.release()
  })

  it('a different piece is not blocked', () => {
    const a = acquirePieceLock('piece-a', { dir })
    const b = acquirePieceLock('piece-b', { dir })
    a.release(); b.release()
  })

  it('re-acquire works after release', () => {
    acquirePieceLock('piece-a', { dir }).release()
    acquirePieceLock('piece-a', { dir }).release()
  })

  it('a DEAD holder is reclaimed (Codex SF5)', () => {
    acquirePieceLock('piece-a', { dir }) // held, not released
    const stolen = acquirePieceLock('piece-a', { dir, isAlive: () => false })
    stolen.release()
  })

  it('a LIVE holder is NEVER reclaimed, even when the lock is old (Codex SF5)', () => {
    acquirePieceLock('piece-a', { dir })
    const old = new Date(Date.now() - 60 * 60 * 1000)
    utimesSync(join(dir, 'piece-a.lock'), old, old) // an hour old, but the holder is alive
    expect(() => acquirePieceLock('piece-a', { dir, staleMs: 1, isAlive: () => true }))
      .toThrow(/holds the lock/)
  })

  it('an unreadable PID falls back to mtime staleness', () => {
    const lockPath = join(dir, 'piece-a.lock')
    writeFileSync(lockPath, 'not-a-pid\n')
    const old = new Date(Date.now() - 60 * 60 * 1000)
    utimesSync(lockPath, old, old)
    const stolen = acquirePieceLock('piece-a', { dir, staleMs: 10 * 60 * 1000, isAlive: () => true })
    stolen.release()
  })

  it('an unreadable but FRESH lock is not stolen', () => {
    writeFileSync(join(dir, 'piece-a.lock'), 'not-a-pid\n') // fresh mtime
    expect(() => acquirePieceLock('piece-a', { dir, staleMs: 10 * 60 * 1000, isAlive: () => true }))
      .toThrow(/holds the lock/)
  })
})
