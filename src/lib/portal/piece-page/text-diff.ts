// Word-level diff for track changes (spec 2026-10-03 section 5). Trims the common start and end,
// then compares the middle word by word (LCS). A middle too large to compare in memory becomes one
// removal and one addition, which is still correct, just coarse.
export type DiffOp = { op: 'equal' | 'insert' | 'delete'; text: string }

const TOKEN = /\s+|[^\s]+/g
const MAX_CELLS = 4_000_000

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? []
}

function push(ops: DiffOp[], op: DiffOp['op'], text: string): void {
  if (!text) return
  const last = ops[ops.length - 1]
  if (last && last.op === op) last.text += text
  else ops.push({ op, text })
}

function diffMiddle(a: string[], b: string[], ops: DiffOp[]): void {
  if (a.length === 0) { push(ops, 'insert', b.join('')); return }
  if (b.length === 0) { push(ops, 'delete', a.join('')); return }
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) {
    push(ops, 'delete', a.join(''))
    push(ops, 'insert', b.join(''))
    return
  }
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push(ops, 'equal', a[i]); i++; j++ }
    else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) { push(ops, 'delete', a[i]); i++ }
    else { push(ops, 'insert', b[j]); j++ }
  }
  while (i < a.length) push(ops, 'delete', a[i++])
  while (j < b.length) push(ops, 'insert', b[j++])
}

export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenize(before)
  const b = tokenize(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const ops: DiffOp[] = []
  push(ops, 'equal', a.slice(0, start).join(''))
  diffMiddle(a.slice(start, endA), b.slice(start, endB), ops)
  push(ops, 'equal', a.slice(endA).join(''))
  return ops
}
