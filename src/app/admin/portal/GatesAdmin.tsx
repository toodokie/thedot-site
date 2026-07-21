import { GATE_ORDER, resolveNineGates, deriveContentStage, deriveMyTasks,
  type StagePiece, type OpsTaskRow, type MyTask, type CompletedOpsTask } from '@/lib/portal/gates'
import StatusPill, { type PillTone } from './StatusPill'
import styles from './portal-admin.module.css'

// Agency-only surface (gate-system spec sections 4 + 6.8): My Tasks + the per-piece gate
// strip render HERE, never in the client shell. Read-only: emissions go through
// portal-write (gate / ops-task). This is a display/IA refactor only; no logic changed.

// Composite React key: content_ids are unique only per tenant (Codex round-3 fix 2).
function taskKey(task: MyTask): string {
  return task.kind === 'ops' ? `ops:${task.id}` : `${task.clientId}:${task.contentId}:${task.kind}`
}

function ClientTag({ name }: { name: string }) {
  return <span className={styles.clientTag}>{name}</span>
}

function TaskRow({ task }: { task: MyTask }) {
  if (task.kind === 'action') {
    return (
      <li className={styles.taskRow}>
        <ClientTag name={task.clientName} />
        <span className={styles.taskTitle}>{task.title}</span>
        <StatusPill tone="open" label={`${task.gate}${task.dest ? `:${task.dest}` : ''}`} />
        {task.moreOpen > 0 && <span className={styles.meta}>+{task.moreOpen} more gates</span>}
      </li>
    )
  }
  if (task.kind === 'waiting_maria') {
    return (
      <li className={styles.taskRow}>
        <ClientTag name={task.clientName} />
        <span className={styles.taskTitle}>{task.title}</span>
        <span className={styles.meta}>waiting on Maria, {task.daysWaiting} business day{task.daysWaiting === 1 ? '' : 's'}</span>
        {task.nudge && <StatusPill tone="nudge" label="nudge?" />}
      </li>
    )
  }
  if (task.kind === 'waiting_studio') {
    return (
      <li className={styles.taskRow}>
        <ClientTag name={task.clientName} />
        <span className={styles.taskTitle}>{task.title}</span>
        <span className={styles.meta}>waiting on studio{task.note ? ` (${task.note})` : ''}</span>
      </li>
    )
  }
  return (
    <li className={styles.taskRow}>
      <ClientTag name={task.clientName} />
      <StatusPill tone="muted" label={task.category} />
      <span className={styles.taskTitle}>{task.title}</span>
      {task.dueDate && <span className={styles.meta}>due {task.dueDate}</span>}
      {task.triggerNote && <span className={styles.meta}>watch: {task.triggerNote}</span>}
    </li>
  )
}

// A piece's stage maps to a semantic pill tone (display only; deriveContentStage owns the
// value). Live/done read positive (teal/check), failures rust, in-flight neutral.
function stageTone(stage: string): PillTone {
  if (stage === 'done') return 'verified'
  if (stage === 'live' || stage === 'posted_unverified') return 'live'
  if (stage === 'scheduled' || stage === 'scheduled_partial') return 'scheduled'
  if (stage === 'approved') return 'done'
  if (stage === 'publish_failed' || stage === 'schedule_failed') return 'failed'
  return 'muted'
}

export default function GatesAdmin({ pieces, opsTasks, completedOps, todayIso }: {
  pieces: StagePiece[]
  opsTasks: OpsTaskRow[]
  completedOps: CompletedOpsTask[]
  todayIso: string
}) {
  const tasks = deriveMyTasks(pieces, opsTasks, todayIso)
  const actions = tasks.filter((task) => task.kind === 'action')
  const maria = tasks.filter((task) => task.kind === 'waiting_maria')
  const studio = tasks.filter((task) => task.kind === 'waiting_studio')
  const ops = tasks.filter((task): task is Extract<MyTask, { kind: 'ops' }> => task.kind === 'ops')
  const opsBuckets: Array<[string, typeof ops]> = (
    ['overdue', 'today', 'this_week', 'upcoming', 'watch'] as const
  ).map((bucket) => [bucket.replace('_', ' '), ops.filter((task) => task.bucket === bucket)])
  const openCount = actions.length + maria.length + studio.length + ops.length
  const visiblePieces = pieces.filter((piece) => !piece.archived)

  const group = (label: string, rows: MyTask[]) => rows.length > 0 && (
    <div className={styles.group} key={label}>
      <div className={styles.groupLabel}>{label}</div>
      <ul className={styles.taskList}>{rows.map((task) => <TaskRow key={taskKey(task)} task={task} />)}</ul>
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
        {openCount === 0
          ? <p className={styles.empty}>Nothing open.</p>
          : <>
            {group('Actions', actions)}
            {group('Waiting on Maria', maria)}
            {group('Waiting on studio', studio)}
            {opsBuckets.map(([label, rows]) => group(`Ops · ${label}`, rows))}
          </>}

        {completedOps.length > 0 && (
          <div className={styles.group}>
            <div className={styles.groupLabel}>Recently completed ops</div>
            <ul className={styles.taskList}>
              {completedOps.map((task) => (
                <li key={task.id} className={styles.taskRow}>
                  <ClientTag name={task.clientName} />
                  <StatusPill tone="muted" label={task.category} />
                  <span className={styles.taskTitle}>{task.title}</span>
                  <span className={styles.meta}>{task.status}{task.completedAt ? ` ${task.completedAt.slice(0, 10)}` : ''}</span>
                  {/* fix B: completion note is separate; the original trigger note survives */}
                  {task.triggerNote && <span className={styles.meta}>trigger: {task.triggerNote}</span>}
                  {task.completionNote && <span className={styles.meta}>outcome: {task.completionNote}</span>}
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
                <th>Client</th><th>Piece</th><th>Stage</th><th>Gates (1-9)</th>
              </tr>
            </thead>
            <tbody>
              {visiblePieces.map((piece) => {
                const stage = deriveContentStage(piece)
                const resolved = resolveNineGates(piece)
                return (
                  <tr key={`${piece.clientId}:${piece.contentId}`}>
                    <td className={styles.cellMuted}>{piece.clientName}</td>
                    <td>{piece.title}</td>
                    <td><StatusPill tone={stageTone(stage.stage)} label={stage.label} /></td>
                    <td>
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
