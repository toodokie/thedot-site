import type { CSSProperties } from 'react'
import type { ContentRow } from '@/lib/portal/data'
import { Heading, Text } from '@thedot/design-system'

const panel: CSSProperties = {
  margin: '28px 0',
  padding: '20px',
  border: '1px solid var(--dot-hairline)',
  background: 'var(--dot-off-white)',
}

export default function FactCheckEvidence({ item }: { item: ContentRow }) {
  return (
    <section aria-labelledby="fact-check-evidence" style={panel}>
      <div id="fact-check-evidence" style={{ marginBottom: 10 }}>
        <Heading level={4}>Fact-check evidence</Heading>
      </div>
      {item.fact_check_scope === 'not_applicable' ? (
        <Text tone="grey">{item.fact_check_exemption ?? 'No factual or regulatory claim in this piece.'}</Text>
      ) : item.fact_check_ledger.length === 0 ? (
        <Text tone="grey">Evidence is still being confirmed.</Text>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {item.fact_check_ledger.map((entry) => (
            <li key={entry.claim_key} style={{ marginBottom: 12 }}>
              <Text>{entry.claim}</Text>
              {entry.source_url && entry.source_title && (
                <a
                  href={entry.source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', minHeight: 44,
                    color: 'var(--dot-graphite)', fontSize: 13,
                  }}
                >
                  {entry.source_title} · checked {entry.checked_at}
                </a>
              )}
              {entry.source_type === 'agency_attested' && entry.source_title && (
                <Text tone="grey">{entry.source_title} · agency-verified {entry.checked_at}</Text>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
