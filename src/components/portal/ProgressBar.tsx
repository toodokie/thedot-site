import type { ProgressModel, StageNode } from '@/lib/portal/progress-bar-model'
import styles from './ProgressBar.module.css'

// The full nine-step progress bar (spec 2026-07-23 v2.1, section 5): the "where is this
// piece" answer that sits under the title on a piece page, in place of a flat status
// label. Pure presentation of a ProgressModel; the same component serves the agency and
// client variants so the two ends can never render a divergent bar. Colour is never the
// only signal: every node also carries a glyph + its plain-English label.

const PLATFORM_SHORT: Record<string, string> = {
  instagram: 'IG', facebook: 'FB', youtube: 'YT', squarespace: 'Web',
}

function Dot({ node }: { node: StageNode }) {
  const glyph = node.state === 'done' ? '✓' : node.state === 'na' ? '–'
    : node.exception ? '!' : ''
  return (
    <span className={styles.dot} data-state={node.state}
      data-exception={node.exception ? 'true' : undefined} aria-hidden="true">{glyph}</span>
  )
}

export default function ProgressBar({ model }: { model: ProgressModel }) {
  if (model.terminal) {
    return (
      <div className={styles.terminal} data-kind={model.terminal.kind} role="status">
        <span className={styles.terminalDot} aria-hidden="true">
          {model.terminal.kind === 'archived' ? '–' : '✓'}
        </span>
        <span>{model.terminal.label}</span>
      </div>
    )
  }

  const exceptions = model.nodes.filter((node) => node.exception)

  return (
    <div className={styles.wrap}>
      <ol className={styles.bar} aria-label="Production progress">
        {model.nodes.map((node, i) => {
          // na counts as satisfied for the connector: progress flows THROUGH a skipped
          // step, it never leaves a gap in the line.
          const prev = model.nodes[i - 1]?.state
          const beforeSolid = i > 0 && (prev === 'done' || prev === 'na')
          const afterSolid = node.state === 'done' || node.state === 'na'
          const isLast = i === model.nodes.length - 1
          return (
            <li key={node.key} className={styles.step} data-state={node.state}
              aria-label={`${node.label}: ${node.state}${node.exception ? `, ${node.exception.note ?? ''}` : ''}`}>
              <div className={styles.track}>
                <span className={`${styles.line} ${i === 0 ? styles.lineHidden : beforeSolid ? styles.lineSolid : ''}`} />
                <Dot node={node} />
                <span className={`${styles.line} ${isLast ? styles.lineHidden : afterSolid ? styles.lineSolid : ''}`} />
              </div>
              <div className={styles.label}>{node.label}</div>
              {node.perPlatform && node.perPlatform.length > 0 && (
                <div className={styles.sub}>
                  {node.perPlatform.map((p) => (
                    <span key={p.destination} className={styles.platform}
                      data-done={p.state === 'done' ? 'true' : undefined}>
                      {PLATFORM_SHORT[p.destination] ?? p.destination}{p.state === 'done' ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {exceptions.length > 0 && (
        <ul className={styles.exceptions}>
          {exceptions.map((node) => (
            <li key={node.key} className={styles.exceptionLine} data-kind={node.exception!.kind}>
              <span aria-hidden="true">{'⚠'}</span> {node.label}: {node.exception!.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
