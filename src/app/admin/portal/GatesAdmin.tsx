import type { ReactNode } from 'react'
import { Eyebrow } from '@thedot/design-system'
import { GATE_ORDER, resolveNineGates, deriveContentStage, deriveMyTasks,
  type StagePiece, type OpsTaskRow, type MyTask, type CompletedOpsTask } from '@/lib/portal/gates'
import StatusPill, { type PillTone } from './StatusPill'
import AdminPageHeader from './AdminPageHeader'
import type { AdminComment } from './data'
import WeekCalendar, { type WeekCalendarChip } from '@/components/portal/WeekCalendar'
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

// The next step, in plain English, NOT the internal gate key. "design-built" is meaningless
// to a human; the row should say what to DO. Dest appended when it is per-platform.
const ACTION_LABEL: Record<string, string> = {
  'fact-check': 'Fact-check',
  'source-in-hand': 'Get studio cut',
  'design-built': 'Build design',
  'proofed': 'Proof it',
  'approval-sent': 'Send to Maria',
  'copy-approved': 'Final copy + design approval',
  'idea-approved': 'Resolve idea approval',
  'scheduled': 'Schedule',
  'posted': 'Post',
  'link-confirmed': 'Confirm link',
}
function actionLabel(gate: string, dest: string | null): string {
  const base = ACTION_LABEL[gate] ?? gate
  return dest ? `${base}: ${dest}` : base
}

// Plain-English names for the nine steps, shown in the Pieces legend (never the raw gate
// keys like "source-in-hand" / "link-confirmed").
const STEP_NAMES = ['Idea sent to Maria', 'Idea approved', 'Fact-check', 'Studio cut', 'Design', 'Proof',
  'Final copy + design sent', 'Final copy + design approved', 'Scheduled', 'Posted', 'Link confirmed']

// One row shape for every task: title on the LEFT, the plain-English next step / status on
// the RIGHT, inline so it sits right beside the title (never stranded far away).
function TaskRow({ task, showClient }: { task: MyTask; showClient: boolean }) {
  const title = 'title' in task ? task.title : ''
  const pieceHref = task.kind === 'ops'
    ? null
    : `/admin/portal/pieces/${encodeURIComponent(task.contentId)}`
  let trail: ReactNode = null
  let lead: ReactNode = null
  if (task.kind === 'action') {
    trail = <StatusPill tone="open" label={actionLabel(task.gate, task.dest)} />
  } else if (task.kind === 'link_pending') {
    trail = <span className={styles.meta}>confirm the live link{task.dest ? ` on ${task.dest}` : ''}{task.moreOpen > 0 ? ` +${task.moreOpen} more` : ''}</span>
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
        {pieceHref
          ? <a className={`${styles.taskTitle} ${styles.pieceLink}`} href={pieceHref} title={title}>{title}</a>
          : <span className={styles.taskTitle} title={title}>{title}</span>}
      </span>
      <span className={styles.taskTrail}>{trail}</span>
    </li>
  )
}

// A stage renders as a SHORT status pill plus muted detail text; a long description never
// lives inside a pill (that produced a wall of identical sentence-pills). deriveContentStage
// owns the value; this only splits it into a keyword + the specifics.
export function stageDisplay(stage: string, label: string): { label: string; tone: PillTone; detail: string } {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  switch (stage) {
    case 'idea': return { label: 'Idea', tone: 'open', detail: '' }
    case 'done': return { label: 'Done', tone: 'verified', detail: '' }
    case 'live': return { label: 'Live', tone: 'live', detail: '' }
    case 'posted_unverified': return { label: 'Posted', tone: 'scheduled', detail: label.replace(/^posted[,]?\s*/i, '') }
    case 'scheduled':
    case 'scheduled_partial': return { label: 'Scheduled', tone: 'scheduled', detail: label.replace(/^scheduled\s*/i, '') }
    case 'approved': return { label: 'Approved', tone: 'done', detail: '' }
    case 'direction_approved': return { label: 'Direction approved', tone: 'done', detail: 'still in production' }
    case 'awaiting_decision': return { label: 'Awaiting Maria', tone: 'open', detail: '' }
    case 'awaiting_idea_approval': return { label: 'Awaiting idea approval', tone: 'open', detail: '' }
    case 'legacy': return {
      label: 'Posted',
      tone: label.includes('not portal-verified') ? 'muted' : 'verified',
      detail: label.replace(/^posted\s*/i, ''),
    }
    case 'needs_platform_mapping': return { label: 'Needs platform mapping', tone: 'failed', detail: '' }
    case 'archived': return { label: 'Archived', tone: 'muted', detail: '' }
    case 'publish_failed':
    case 'schedule_failed': return { label: 'Issue', tone: 'failed', detail: label }
    case 'in_production': return { label: cap(label), tone: 'muted', detail: '' } // "needs design" etc, already short
    default: return { label: 'Draft', tone: 'muted', detail: '' }
  }
}

function formatPieceDate(value: string | null | undefined): string {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function weekCalendarDays(pieces: StagePiece[]): Record<string, WeekCalendarChip[]> {
  const days: Record<string, WeekCalendarChip[]> = {}
  for (const piece of pieces) {
    if (piece.archived || !piece.plannedDate) continue
    const { stage, label } = deriveContentStage(piece)
    const display = stageDisplay(stage, label)
    const accent: WeekCalendarChip['accent'] = (
      stage === 'done' || stage === 'posted_unverified' || stage === 'legacy'
        ? 'grey'
        : stage === 'approved' || stage === 'direction_approved'
          || stage === 'scheduled' || stage === 'scheduled_partial'
          ? 'graphite'
          : 'yellow'
    )
    const chip: WeekCalendarChip = {
      id: `${piece.clientId}:${piece.contentId}`,
      href: `/admin/portal/pieces/${encodeURIComponent(piece.contentId)}`,
      title: piece.title,
      meta: [piece.format, piece.pillar].filter(Boolean).join(' · ') || null,
      platforms: piece.platforms,
      stateNote: [display.label, display.detail].filter(Boolean).join(' · '),
      syncLabel: null,
      accent,
    }
    const date = piece.plannedDate.slice(0, 10)
    ;(days[date] ??= []).push(chip)
  }
  return days
}

// My tasks: the landing surface (spec IA #1). Its own routed page (/admin/portal) so it is
// never buried under the rest of the ops board.
export function MyTasksAdmin({ pieces, opsTasks, completedOps, openComments, todayIso }: {
  pieces: StagePiece[]
  opsTasks: OpsTaskRow[]
  completedOps: CompletedOpsTask[]
  openComments: AdminComment[]
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
  // Single-client board: drop the repeated client name / column entirely (it was noise on
  // every row). Shows again the moment a second client's pieces appear.
  const multiClient = new Set(pieces.map((p) => p.clientId)).size > 1
  const calendarDays = weekCalendarDays(pieces)

  // Each bucket is its OWN panel card (the client-overview pattern: many distinct cards in a
  // two-column grid), instead of one crammed box. `emphasis` gives the priority bucket the
  // charcoal-bordered lead treatment; its action rows already carry the yellow-pale chips.
  const Panel = ({ label, note, rows, emphasis }:
    { label: string; note?: string; rows: MyTask[]; emphasis?: boolean }) =>
    rows.length > 0 ? (
      <section className={emphasis ? `${styles.card} ${styles.hero}` : styles.card}>
        <div className={styles.panelHead}><Eyebrow tone="grey">{label}</Eyebrow></div>
        {note && <p className={styles.panelNote}>{note}</p>}
        <ul className={styles.taskList}>
          {rows.map((task) => <TaskRow key={taskKey(task)} task={task} showClient={multiClient} />)}
        </ul>
      </section>
    ) : null

  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="My tasks" display
        intro="What needs doing, most pressing first." count={openCount + openComments.length} countLabel="open" />
      {openCount === 0 && linkPending.length === 0 ? (
        <section className={styles.card}><p className={styles.empty}>Nothing open.</p></section>
      ) : (
        <div className={styles.grid}>
          <div>
            <Panel label="Actions" note="Your move, most pressing first." rows={actions} emphasis />
            <Panel label="Waiting on Maria" rows={maria} />
            <Panel label="Waiting on studio" rows={studio} />
          </div>
          <aside>
            <section className={styles.card}>
              <WeekCalendar days={calendarDays} todayIso={todayIso} label="This week" />
            </section>
            {openComments.length > 0 && (
              <section className={styles.card}>
                <div className={styles.panelHead}><Eyebrow tone="grey">Comments needing reply</Eyebrow></div>
                <p className={styles.panelNote}>Client feedback is retained here until you handle it.</p>
                <ul className={styles.taskList}>
                  {openComments.slice(0, 10).map((comment) => (
                    <li key={`comment:${comment.id}`} className={styles.taskRow}>
                      <span className={styles.taskMain}>
                        <a href={`/admin/portal/pieces/${encodeURIComponent(comment.contentId)}`} className={styles.pieceLink}>
                          {comment.title}
                        </a>
                        <span className={styles.meta}>{comment.targetKind === 'design' ? 'design' : 'copy'} · {comment.clientName}</span>
                      </span>
                      <span className={styles.taskTrail}><span className={styles.meta}>{comment.createdAt.slice(0, 10)}</span></span>
                    </li>
                  ))}
                </ul>
                {openComments.length > 10 && <a href="/admin/portal/comments" className={styles.moreLink}>Open all {openComments.length} comments</a>}
              </section>
            )}
            <Panel label="Posted · link-confirm pending" rows={linkPending} />
            {opsBuckets.map(([label, rows]) => <Panel key={label} label={`Ops · ${label}`} rows={rows} />)}
            {completedOps.length > 0 && (
              <section className={styles.card}>
                <div className={styles.panelHead}><Eyebrow tone="grey">Recently completed ops</Eyebrow></div>
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
                        {/* completion note is separate; the original trigger note survives */}
                        {task.triggerNote && <span className={styles.meta}>trigger: {task.triggerNote}</span>}
                        {task.completionNote && <span className={styles.meta}>outcome: {task.completionNote}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </>
  )
}

// Pieces (spec IA #2): every piece and how far along it is, as a styled table with a legend
// for the nine-gate strip. Its own routed page (/admin/portal/pieces).
export function PiecesAdmin({ pieces }: { pieces: StagePiece[] }) {
  const visiblePieces = pieces.filter((piece) => !piece.archived)
  const orderedPieces = [...visiblePieces].sort((a, b) => {
    const date = (piece: StagePiece) => piece.latestPublishedAt ?? piece.plannedDate ?? ''
    return date(b).localeCompare(date(a)) || a.title.localeCompare(b.title)
  })
  // Single-client board: drop the repeated client name / column (noise on every row).
  const multiClient = new Set(pieces.map((p) => p.clientId)).size > 1
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Pieces"
        intro="Every piece, and how far along it is. The squares track the nine steps, left to right."
        count={visiblePieces.length} countLabel="active" />
      <section className={styles.card}>
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.legendItem}><span className={`${styles.gateCell} ${styles.gateDone}`} /> done</span>
          <span className={styles.legendItem}><span className={`${styles.gateCell} ${styles.gateOpen}`} /> open</span>
          <span className={styles.legendItem}><span className={`${styles.gateCell} ${styles.gateNa}`} /> n/a</span>
          <span className={styles.legendItem}><span className={`${styles.gateCell} ${styles.gateAbsent}`} /> not tracked</span>
          <span className={styles.legendItem}>steps: {STEP_NAMES.join(' · ')}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.dateCol}>Date</th>{multiClient && <th>Client</th>}<th className={styles.pieceCol}>Piece</th><th>Stage</th><th className={styles.gatesCol}>Steps</th>
              </tr>
            </thead>
            <tbody>
              {orderedPieces.map((piece) => {
                const stage = deriveContentStage(piece)
                const sd = stageDisplay(stage.stage, stage.label)
                const resolved = resolveNineGates(piece)
                return (
                  <tr key={`${piece.clientId}:${piece.contentId}`}>
                    <td className={`${styles.cellMuted} ${styles.cellNum}`}>{formatPieceDate(piece.latestPublishedAt ?? piece.plannedDate)}</td>
                    {multiClient && <td className={styles.cellMuted}>{piece.clientName}</td>}
                    <td className={styles.pieceCol}>
                      <a href={`/admin/portal/pieces/${encodeURIComponent(piece.contentId)}`} className={styles.pieceLink}>{piece.title}</a>
                    </td>
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
