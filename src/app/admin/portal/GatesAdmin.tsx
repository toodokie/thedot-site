import type { CSSProperties } from 'react'
import { GATE_ORDER, resolveNineGates, deriveContentStage, deriveMyTasks,
  type StagePiece, type OpsTaskRow, type MyTask, type CompletedOpsTask } from '@/lib/portal/gates'

// Agency-only surface (gate-system spec sections 4 + 6.8): My Tasks + the per-piece
// gate strip render HERE, never in the client shell. Read-only in v1; emissions go
// through `portal-write gate` / `ops-task`.

const cell: CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #e5e5e5', fontSize: 13, verticalAlign: 'top' }
const dot = (state: string): CSSProperties => ({
  display: 'inline-block', width: 12, height: 12, borderRadius: 6, marginRight: 3,
  background: state === 'done' ? '#1a1a1a' : state === 'na' ? '#c9c9c9' : 'transparent',
  border: state === 'open' ? '1px solid #999' : '1px solid transparent',
})
const chip: CSSProperties = {
  display: 'inline-block', padding: '1px 7px', fontSize: 11, fontWeight: 600,
  background: '#ffd700', color: '#1a1a1a', borderRadius: 2, marginLeft: 6,
}

function TaskRow({ task }: { task: MyTask }) {
  if (task.kind === 'action') {
    return <li>{task.title}: <strong>{task.gate}{task.dest ? `:${task.dest}` : ''}</strong>
      {task.moreOpen > 0 && <span style={{ color: '#777' }}> (+{task.moreOpen} more gates)</span>}</li>
  }
  if (task.kind === 'waiting_maria') {
    return <li>{task.title}: waiting on Maria, {task.daysWaiting} business day{task.daysWaiting === 1 ? '' : 's'}
      {task.nudge && <span style={chip}>nudge?</span>}</li>
  }
  if (task.kind === 'waiting_studio') {
    return <li>{task.title}: waiting on studio{task.note ? ` (${task.note})` : ''}</li>
  }
  return <li>[{task.category}] {task.title}{task.dueDate ? ` · due ${task.dueDate}` : ''}
    {task.triggerNote ? ` · watch: ${task.triggerNote}` : ''}</li>
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

  return (
    <section style={{ marginTop: 40 }}>
      <h2>Production gates (agency-only)</h2>
      <p style={{ color: '#555', maxWidth: 760, fontSize: 14 }}>
        Derived, never stored: the my-tasks view and per-piece stage over production gates,
        decisions, schedule targets, and publication evidence. Nothing here is client-visible.
        Emissions run through portal-write (gate / ops-task); this surface only reads.
      </p>

      <h3>My tasks</h3>
      {actions.length === 0 && maria.length === 0 && studio.length === 0 && ops.length === 0
        ? <p style={{ color: '#777' }}>Nothing open.</p>
        : <>
          {actions.length > 0 && <><h4>Actions</h4><ul>{actions.map((task, i) => <TaskRow key={i} task={task} />)}</ul></>}
          {maria.length > 0 && <><h4>Waiting on Maria</h4><ul>{maria.map((task, i) => <TaskRow key={i} task={task} />)}</ul></>}
          {studio.length > 0 && <><h4>Waiting on studio</h4><ul>{studio.map((task, i) => <TaskRow key={i} task={task} />)}</ul></>}
          {opsBuckets.map(([label, rows]) => rows.length > 0
            && <div key={label}><h4>Ops · {label}</h4><ul>{rows.map((task, i) => <TaskRow key={i} task={task} />)}</ul></div>)}
        </>}

      {completedOps.length > 0 && <>
        <h3>Recently completed ops</h3>
        <ul>
          {completedOps.map((task) => (
            <li key={task.id}>
              [{task.category}] {task.title} · {task.status}
              {task.completedAt ? ` ${task.completedAt.slice(0, 10)}` : ''}
              {/* fix B: the completion note is separate; the original trigger note survives */}
              {task.triggerNote && <span style={{ color: '#777' }}> · trigger: {task.triggerNote}</span>}
              {task.completionNote && <span style={{ color: '#777' }}> · outcome: {task.completionNote}</span>}
            </li>
          ))}
        </ul>
      </>}

      <h3>Pieces</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left' }}>Piece</th>
            <th style={{ ...cell, textAlign: 'left' }}>Stage</th>
            <th style={{ ...cell, textAlign: 'left' }}>Gates (1-9)</th>
          </tr>
        </thead>
        <tbody>
          {pieces.filter((piece) => !piece.archived).map((piece) => {
            const stage = deriveContentStage(piece)
            const resolved = resolveNineGates(piece)
            return (
              <tr key={piece.contentId}>
                <td style={cell}>{piece.title}</td>
                <td style={cell}>{stage.label}</td>
                <td style={cell} title={resolved.map((gate) =>
                  `${gate.key}${gate.dest ? ':' + gate.dest : ''}: ${gate.present ? gate.state : 'not tracked'}`).join('\n')}>
                  {GATE_ORDER.map((key) => {
                    const rows = resolved.filter((gate) => gate.key === key)
                    const state = rows.length === 0 || rows.some((gate) => !gate.present) ? 'absent'
                      : rows.every((gate) => gate.state === 'done') ? 'done'
                      : rows.every((gate) => gate.state !== 'open') ? 'na'
                      : 'open'
                    return <span key={key} style={state === 'absent'
                      ? { ...dot('open'), borderStyle: 'dashed' } : dot(state)} />
                  })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
