import { Eyebrow, Text } from '@thedot/design-system'
import type { PublicationTargetRow } from '@/lib/portal/publication'

function formatTime(value: string | null): string {
  if (!value) return 'Not confirmed'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value))
}

export default function PublicationPanel({ targets }: { targets: PublicationTargetRow[] }) {
  return (
    <section aria-labelledby="publication-heading" style={{
      margin: '32px 0', padding: '20px 0', borderTop: '1px solid var(--dot-hairline)',
      borderBottom: '1px solid var(--dot-hairline)',
    }}>
      <div id="publication-heading"><Eyebrow tone="grey">Publication</Eyebrow></div>
      {targets.length === 0 ? (
        <div style={{ marginTop: 10 }}><Text tone="grey">Nothing has been independently confirmed live yet.</Text></div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0' }}>
          {targets.map((target) => (
            <li key={target.id} style={{ padding: '12px 0', borderTop: '1px solid var(--dot-hairline)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <Text as="span" tone="black">{target.destination}</Text>
                <Text as="span" size="sm" tone="graphite">{formatTime(target.published_at)}</Text>
              </div>
              <div style={{ marginTop: 4 }}>
                <Text size="sm" tone="grey">
                  {target.status.replaceAll('_', ' ')} · {target.verification_label}
                </Text>
              </div>
              {target.live_url && target.status === 'live' && (
                <a href={target.live_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  Open the live post
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
