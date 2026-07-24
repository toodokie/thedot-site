import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'

// Per-piece cross-process mutex for update-portal (Codex blocker 2). It serializes the whole
// read -> build -> canonical commit -> sync operation so two concurrent runs cannot commit different
// bodies at the same version (the DB row lock cannot protect the preceding filesystem commit).
//
// O_EXCL (`wx`) create is atomic. Stealing (Codex round-2 SF5): a live holder is NEVER stolen — the
// lock records the holder PID and a lock is reclaimed only if that PID is no longer alive. mtime
// staleness is a fallback for a lock whose PID can't be read (e.g. a truncated write). Extracted here
// (dir + staleMs + isAlive injected) so it is unit-testable without the full CLI.
export function acquirePieceLock(
  contentId: string,
  opts: { dir: string; staleMs?: number; isAlive?: (pid: number) => boolean },
): { release: () => void } {
  const staleMs = opts.staleMs ?? 10 * 60 * 1000
  const isAlive = opts.isAlive ?? defaultIsAlive
  mkdirSync(opts.dir, { recursive: true })
  const lockPath = join(opts.dir, `${contentId}.lock`)

  const tryCreate = (): number | null => {
    try {
      return openSync(lockPath, 'wx')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') return null
      throw e
    }
  }

  let fd = tryCreate()
  if (fd === null && reclaimable(lockPath, staleMs, isAlive)) {
    try { unlinkSync(lockPath) } catch { /* another run reclaimed it first */ }
    fd = tryCreate()
  }
  if (fd === null) {
    throw new Error(`another update-portal run holds the lock for ${contentId} (${lockPath})`)
  }
  try { writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`) } finally { closeSync(fd) }
  return { release: () => { try { unlinkSync(lockPath) } catch { /* already released */ } } }
}

// A held lock is reclaimable only if its holder is gone: a readable, live PID is never stolen (a
// legitimately long-running apply must survive past staleMs). A dead PID is reclaimed. An unreadable
// PID falls back to mtime staleness so a corrupt lock can't wedge the piece forever.
function reclaimable(lockPath: string, staleMs: number, isAlive: (pid: number) => boolean): boolean {
  let pid: number | null = null
  try { pid = Number.parseInt(readFileSync(lockPath, 'utf8').split('\n')[0]?.trim() ?? '', 10) } catch { /* unreadable */ }
  if (pid !== null && Number.isInteger(pid) && pid > 0) return !isAlive(pid)
  let age = Infinity
  try { age = Date.now() - statSync(lockPath).mtimeMs } catch { return true /* vanished */ }
  return age > staleMs
}

function defaultIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM' // exists but not ours -> still alive
  }
}
