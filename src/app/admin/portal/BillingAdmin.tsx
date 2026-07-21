'use client'
import { useState } from 'react'
import styles from './portal-admin.module.css'
import StatusPill from './StatusPill'

export type AdminInvoice = {
  id: string
  clientId: string
  clientName: string
  number: string
  issuedAt: string
  amount: string
  currency: string
  status: 'paid' | 'unpaid' | 'void'
  documentUrl: string | null
}

function idempotencyKey(): string {
  return `inv-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

export default function BillingAdmin({ invoices }: { invoices: AdminInvoice[] }) {
  const [rows, setRows] = useState(invoices)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function op(body: Record<string, unknown>, invoiceId: string): Promise<boolean> {
    setBusy(invoiceId)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/portal/billing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey: idempotencyKey() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      setMessage('Saved.')
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed')
      return false
    } finally {
      setBusy(null)
    }
  }

  // Only paid <-> unpaid are casual toggles. Void is terminal, so it is a separate confirmed action.
  async function setPaidState(inv: AdminInvoice, status: 'paid' | 'unpaid') {
    const ok = await op({ operation: 'set_status', clientId: inv.clientId, invoiceId: inv.id, status }, inv.id)
    if (ok) setRows((r) => r.map((x) => (x.id === inv.id ? { ...x, status } : x)))
  }

  async function voidInvoice(inv: AdminInvoice) {
    if (!window.confirm(`Void invoice #${inv.number} for ${inv.clientName}? This is permanent and cannot be undone.`)) return
    const ok = await op({ operation: 'set_status', clientId: inv.clientId, invoiceId: inv.id, status: 'void' }, inv.id)
    if (ok) setRows((r) => r.map((x) => (x.id === inv.id ? { ...x, status: 'void' } : x)))
  }

  async function attach(inv: AdminInvoice, documentUrl: string) {
    const ok = await op({ operation: 'attach_document', clientId: inv.clientId, invoiceId: inv.id, documentUrl }, inv.id)
    if (ok) setRows((r) => r.map((x) => (x.id === inv.id ? { ...x, documentUrl } : x)))
  }

  return (
    <>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>Billing</div>
      </div>
      {message && <p className={styles.statusMsg} role="status">{message}</p>}
      {rows.length === 0 ? (
        <p className={styles.empty}>No invoices yet. Create them with <span className={styles.codeId}>portal-write invoice</span>.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Client</th><th>Invoice</th><th>Amount</th><th>Status</th><th>Document</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => {
                const isVoid = inv.status === 'void'
                return (
                  <tr key={inv.id} className={isVoid ? styles.voided : undefined}>
                    <td>{inv.clientName}</td>
                    <td>#{inv.number}<div className={styles.metaLine}>{inv.issuedAt}</div></td>
                    <td className={`${styles.cellNum} ${styles.nowrap}`}>{inv.currency} {inv.amount}</td>
                    <td>
                      {isVoid ? (
                        <StatusPill tone="na" label="void (final)" />
                      ) : (
                        <span className={`${styles.actions} ${styles.rowActions}`}>
                          <StatusPill tone={inv.status === 'paid' ? 'verified' : 'muted'} label={inv.status} />
                          <select
                            className={`${styles.select} ${styles.controlAuto}`}
                            value={inv.status}
                            disabled={busy === inv.id}
                            onChange={(e) => setPaidState(inv, e.target.value as 'paid' | 'unpaid')}
                            aria-label={`Payment status for invoice ${inv.number}`}
                          >
                            <option value="unpaid">Unpaid</option>
                            <option value="paid">Paid</option>
                          </select>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnDanger}`}
                            disabled={busy === inv.id}
                            onClick={() => voidInvoice(inv)}
                            title="Void this invoice (permanent)"
                          >
                            Void…
                          </button>
                        </span>
                      )}
                    </td>
                    <td>
                      {inv.documentUrl
                        ? <a className={styles.destLink} href={inv.documentUrl} target="_blank" rel="noreferrer">View</a>
                        : <span className={styles.cellMuted}>None</span>}
                      {!isVoid && (
                        <AttachForm disabled={busy === inv.id} onAttach={(url) => attach(inv, url)} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function AttachForm({ onAttach, disabled }: { onAttach: (url: string) => void; disabled: boolean }) {
  const [url, setUrl] = useState('')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (url) { onAttach(url); setUrl('') } }}
      className={styles.inlineForm}
    >
      <input
        className={`${styles.input} ${styles.controlAuto}`}
        type="url"
        placeholder="Google Doc/Drive link"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={disabled}
        aria-label="Invoice document link"
      />
      <button type="submit" className={styles.btn} disabled={disabled || !url}>Attach</button>
    </form>
  )
}
