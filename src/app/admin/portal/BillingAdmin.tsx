'use client'
import { useState } from 'react'

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

  async function setStatus(inv: AdminInvoice, status: AdminInvoice['status']) {
    const ok = await op({ operation: 'set_status', clientId: inv.clientId, invoiceId: inv.id, status }, inv.id)
    if (ok) setRows((r) => r.map((x) => (x.id === inv.id ? { ...x, status } : x)))
  }

  async function attach(inv: AdminInvoice, documentUrl: string) {
    const ok = await op({ operation: 'attach_document', clientId: inv.clientId, invoiceId: inv.id, documentUrl }, inv.id)
    if (ok) setRows((r) => r.map((x) => (x.id === inv.id ? { ...x, documentUrl } : x)))
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2>Billing</h2>
      {message && <p role="status">{message}</p>}
      {rows.length === 0 ? (
        <p>No invoices yet. Create them with <code>portal-write invoice</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>Client</th><th>Invoice</th><th>Amount</th><th>Status</th><th>Document</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <tr key={inv.id} style={{ borderTop: '1px solid #ddd' }}>
                <td>{inv.clientName}</td>
                <td>#{inv.number}<br /><small>{inv.issuedAt}</small></td>
                <td style={{ whiteSpace: 'nowrap' }}>{inv.currency} {inv.amount}</td>
                <td>
                  <select
                    value={inv.status}
                    disabled={busy === inv.id}
                    onChange={(e) => setStatus(inv, e.target.value as AdminInvoice['status'])}
                    aria-label={`Status for invoice ${inv.number}`}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                    <option value="void">Void</option>
                  </select>
                </td>
                <td>
                  {inv.documentUrl
                    ? <a href={inv.documentUrl} target="_blank" rel="noreferrer">View</a>
                    : <span>None</span>}
                  <AttachForm disabled={busy === inv.id} onAttach={(url) => attach(inv, url)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function AttachForm({ onAttach, disabled }: { onAttach: (url: string) => void; disabled: boolean }) {
  const [url, setUrl] = useState('')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (url) { onAttach(url); setUrl('') } }}
      style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}
    >
      <input
        type="url"
        placeholder="Google Doc/Drive link"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={disabled}
        aria-label="Invoice document link"
      />
      <button type="submit" disabled={disabled || !url}>Attach</button>
    </form>
  )
}
