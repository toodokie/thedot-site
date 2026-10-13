import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getInvoices, type InvoiceRow } from '@/lib/portal/invoices'
import { Eyebrow, Heading, Text, Arrow } from '@thedot/design-system'
import styles from './billing.module.css'

function formatAmount(amount: string, currency: string): string {
  const n = Number(amount)
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency || 'CAD' })
    .format(Number.isFinite(n) ? n : 0)
}

// issued_at / period dates arrive as 'YYYY-MM-DD'; render in Toronto-neutral local terms.
function formatDate(d: string | null): string {
  if (!d) return ''
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function StatusBadge({ status }: { status: InvoiceRow['status'] }) {
  const label = status === 'paid' ? 'Paid' : status === 'void' ? 'Void' : 'Unpaid'
  const cls = status === 'paid' ? styles.paid : status === 'void' ? styles.void : styles.unpaid
  return <span className={`${styles.badge} ${cls}`}>{label}</span>
}

export default async function Billing({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  const invoices = await getInvoices(session.clientId)

  return (
    <div className={styles.wrap}>
      <div className={styles.kicker}><Eyebrow tone="grey">Kanset · Billing</Eyebrow></div>
      <div className={styles.title}><Heading level={2}>Billing</Heading></div>
      <Text size="lg" tone="graphite" className={styles.intro}>
        Your invoices from The Dot Creative. Open any invoice to see the full document.
      </Text>

      {invoices.length === 0 ? (
        <div className={styles.empty}><Text size="md" tone="graphite">No invoices yet.</Text></div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Document</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <Text as="span" size="md" tone="black">{formatDate(inv.issued_at)}</Text>
                    <span className={styles.sub}>
                      #{inv.number}
                      {inv.period_start && inv.period_end
                        ? ` · ${formatDate(inv.period_start)} to ${formatDate(inv.period_end)}`
                        : ''}
                    </span>
                  </td>
                  <td className={styles.amount}>
                    <Text as="span" size="md" tone="black">{formatAmount(inv.amount, inv.currency)}</Text>
                  </td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td>
                    {inv.document_url ? (
                      <a
                        className={styles.docLink}
                        href={inv.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View invoice <Arrow direction="right" size={16} />
                      </a>
                    ) : (
                      <Text as="span" size="sm" tone="graphite">Not attached</Text>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
