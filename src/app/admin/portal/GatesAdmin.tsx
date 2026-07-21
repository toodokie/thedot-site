import type { ReactNode } from 'react'
import { GATE_ORDER, resolveNineGates, deriveContentStage, deriveMyTasks,
  type StagePiece, type OpsTaskRow, type MyTask, type CompletedOpsTask } from '@/lib/portal/gates'
import StatusPill, { type PillTone } from './StatusPill'
import styles from './portal-admin.module.css'

// Agency-only surface (gate-system spec sections 4 + 6.8): My Tasks + the per-piece gate
// strip render HERE, never in the client shell. Read-only: emissions go through
// portal-write (gate / ops-task).

// Composite React key: content_ids are unique only per tenant (Codex round-3 fix 2).
function taskKey(task: MyTask): string {
  return task.kind === 'ops' ? `ops:${task.id}` : `${task.clientId}:${task.contentId}:${task.kind}`
}

// The client name only earns a slot when more than one client is on the board; with a
// single client it repeated on every row as pure noise (Anastasia, 2026-07-21).
function ClientTag({ name, show }: { name: string; show: boolean }) {
  if (!show) return null
  return <span className={styles.clientTag}>{name}</span>
}

// One row shape for every task: title on the LEFT (truncated, full text on hover), the
// status / gate / meta cluster on the RIGHT so pills align in a column across all rows.
function TaskRow({ task, showClient }: { task: MyTask; showClient: boolean }) {
  const title = 'title' in task ? task.title : ''
  let trail: ReactNode = null
  let lead: ReactNode = null
  if (task.kind === 'action') {
    trail = <>
      <StatusPill tone="open" label={`${task.gate}${task.dest ? `:${task.dest}` : ''}`} />
      {task.moreOpen > 0 && <span className={styles.meta}>+{task.moreOpen}</span>}
    </>
  } else if (task.kind === 'link_pending') {
    trail = <span className={styles.meta}>confirm link{task.dest ? `: ${task.dest}` : ''}{task.moreOpen > 0 ? ` (+${task.moreOpen})` : ''}</span>
  } else if (task.kind === 'waiting_maria') {
    trail = <>
      <span className={styles.meta}>waiting on Maria, {task.daysWaiting} business day{task.daysWaiting === 1 ? '' : 's'}</span>
      {task.nudge && <StatusPill tone="nudge" label="nudge?" />}
    </>
  } else if (task.kind === 'waiting_studio') {
    trail = <span className={styles.meta}>waiting on studio{task.note ? ` (${task.note})` : ''}</span>
  } else {
    lead = <StatusPill tone="muted" label={task.category} />
    trail = <>
      {task.dueDate && <span className={styles.meta}>due {task.dueDate}</span>}
      {task.triggerNote && <span className={styles.meta}>watch: {task.triggerNote}</span>}
    </>
  }
  return (
    <li className={styles.taskRow}>
      <span className={styles.taskMain}>
        <ClientTag name={task.clientName} show={showClient} />
        {lead}
        <span className={styles.taskTitle} title={title}>{title}</span>
      </span>
      <span className={styles.taskTrail}>{trail}</span>
    </li>
  )
}

// A stage renders as a SHORT status pill plus muted detail text; a long description never
// lives inside a pill (that produced a wall of identical sentence-pills). deriveContentStage
// owns the value; this only splits it into a keyword + the specifics.
function stageDisplay(stage: string, label: string): { label: string; tone: PillTone; detail: string } {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  switch (stage) {
    case 'done': return { label: 'Done', tone: 'verified', detail: '' }
    case 'live': return { label: 'Live', tone: 'live', detail: '' }
    case 'posted_unverified': return { label: 'Posted', tone: 'scheduled', detail: label.replace(/^posted[,]?\s*/i, '') }
    case 'scheduled':
    case 'scheduled_partial': return { label: 'Scheduled', tone: 'scheduled', detail: label.replace(/^scheduled\s*/i, '') }
    case 'approved': return { label: 'Approved', tone: 'done', detail: '' }
    case 'direction_approved': return { label: 'Direction approved', tone: 'done', detail: 'production gates open' }
    case 'awaiting_decision': return { label: 'Awaiting Maria', tone: 'open', detail: '' }
    case 'publish_failed':
    case 'schedule_failed': return { label: 'Issue', tone: 'failed', detail: label }
    case 'in_production': return { label: cap(label), tone: 'muted', detail: '' } // "needs design" etc, already short
    default: return { label: 'Draft', tone: 'muted', detail: '' }
  }
}

export default function GatesAdmin({ pieces, opsTasks, completedOps, todayIso }: {
  pieces: StagePiece[]
  opsTasks: OpsTaskRow[]
  completedOps: CompletedOpsTask[]
  todayIso: string
}) {
  const tasks = deriveMyTasks(pieces, opsTasks, todayIso)
  const actions = tasks.filter((task) => task.kind === 'action')
  const linkPending = tasks.filter((task) => task.kind === 'link_pending')
  const maria = tasks.filter((task) => task.kind === 'waiting_maria')
  const studio = tasks.filter((task) => task.kind === 'waiting_studio')
  const ops = tasks.filter((task): task is Extract<MyTask, { kind: 'ops' }> => task.kind === 'ops')
  const opsBuckets: Array<[string, typeof ops]> = (
    ['overdue', 'today', 'this_week', 'upcoming', 'watch'] as const
  ).map((bucket) => [bucket.replace('_', ' '), ops.filter((task) => task.bucket === bucket)])
  // The headline count is the genuinely-open WORK; link-confirm bookkeeping has its own
  // labelled group and does not inflate it.
  const openCount = actions.length + maria.length + studio.length + ops.length
  const visiblePieces = pieces.filter((piece) => !piece.archived)
  // Single-client board: drop the repeated client name / column entirely (it was noise on
  // every row). Shows again the moment a second client's pieces appear.
  const multiClient = new Set(pieces.map((p) => p.clientId)).size > 1

  const group = (label: string, rows: MyTask[]) => rows.length > 0 && (
    <div className={styles.group} key={label}>
      <div className={styles.groupLabel}>{label}</div>
      <ul className={styles.taskList}>{rows.map((task) => <TaskRow key={taskKey(task)} task={task} showClient={multiClient} />)}</ul>
    </div>
  )

  return (
    <>
      {/* My Tasks: the hero card (spec IA #1) */}
      <section className={`${styles.card} ${styles.hero}`}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.cardTitle}>My tasks</div>
            <div className={styles.cardSub}>Derived from production gates, decisions, schedule + publication evidence. Agency-only; emissions go through portal-write.</div>
          </div>
          <span className={styles.count}>{openCount} open</span>
        </div>
        {openCount === 0 && linkPending.length === 0
          ? <p className={styles.empty}>Nothing open.</p>
          : <>
            {group('Actions', actions)}
            {group('Waiting on Maria', maria)}
            {group('Waiting on studio', studio)}
            {opsBuckets.map(([label, rows]) => group(`Ops · ${label}`, rows))}
            {group(`Posted · link-confirm pending (${linkPending.length})`, linkPending)}
          </>}

        {completedOps.length > 0 && (
          <div className={styles.group}>
            <div className={styles.groupLabel}>Recently completed ops</div>
            <ul className={styles.taskList}>
              {completedOps.map((task) => (
                <li key={task.id} className={styles.taskRow}>
                  <span className={styles.taskMain}>
                    <ClientTag name={task.clientName} show={multiClient} />
                    <StatusPill tone="muted" label={task.category} />
                    <span className={styles.taskTitle} title={task.title}>{task.title}</span>
                  </span>
                  <span className={styles.taskTrail}>
                    <span className={styles.meta}>{task.status}{task.completedAt ? ` ${task.completedAt.slice(0, 10)}` : ''}</span>
                    {/* fix B: completion note is separate; the original trigger note survives */}
                    {task.triggerNote && <span className={styles.meta}>trigger: {task.triggerNote}</span>}
                    {task.completionNote && <span className={styles.meta}>outcome: {task.completionNote}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Pieces (spec IA #2): styled table + a legend for the 9-gate strip */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.cardTitle}>Pieces</div>
            <div className={styles.cardSub}>Per-piece stage and the nine-gate strip in canonical order.</div>
          </div>
          <span className={styles.count}>{visiblePieces.length} active</span>
        </div>
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.legendItem}><span className={`${styles.gateCell} ${styles.gateDone}`} /> done</span>
          <span className={styles.legendItem}><span className={`${styles.gateCell} ${styles.gateOpen}`} /> open</span>
          <span className={styles.legendItem}><span className={`${styles.gateCell} ${styles.gateNa}`} /> n/a</span>
          <span className={styles.legendItem}><span className={`${styles.gateCell} ${styles.gateAbsent}`} /> not tracked</span>
          <span className={styles.legendItem}>order: {GATE_ORDER.join(' · ')}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {multiClient && <th>Client</th>}<th className={styles.pieceCol}>Piece</th><th>Stage</th><th className={styles.gatesCol}>Gates (1-9)</th>
              </tr>
            </thead>
            <tbody>
              {visiblePieces.map((piece) => {
                const stage = deriveContentStage(piece)
                const sd = stageDisplay(stage.stage, stage.label)
                const resolved = resolveNineGates(piece)
                return (
                  <tr key={`${piece.clientId}:${piece.contentId}`}>
                    {multiClient && <td className={styles.cellMuted}>{piece.clientName}</td>}
                    <td className={styles.pieceCol}>{piece.title}</td>
                    <td>
                      <span className={styles.stageCell}>
                        <StatusPill tone={sd.tone} label={sd.label} />
                        {sd.detail && <span className={styles.stageDetail}>{sd.detail}</span>}
                      </span>
                    </td>
                    <td className={styles.gatesCol}>
                      <span className={styles.gateStrip} title={resolved.map((gate) =>
                        `${gate.key}${gate.dest ? ':' + gate.dest : ''}: ${gate.present ? gate.state : 'not tracked'}`).join('\n')}>
                        {GATE_ORDER.map((key) => {
                          const rows = resolved.filter((gate) => gate.key === key)
                          const cls = rows.length === 0 || rows.some((gate) => !gate.present) ? styles.gateAbsent
                            : rows.every((gate) => gate.state === 'done') ? styles.gateDone
                            : rows.every((gate) => gate.state !== 'open') ? styles.gateNa
                            : styles.gateOpen
                          return <span key={key} className={`${styles.gateCell} ${cls}`} />
                        })}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
