import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifySession } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { loadAgencyStagePiece } from '@/lib/portal/gates-loader'
import { agencyProgress, AGENCY_LABELS } from '@/lib/portal/progress-bar-model'
import { resolveNineGates } from '@/lib/portal/gates'
import { Eyebrow, Text, Button } from '@thedot/design-system'
import AdminPageHeader from '../../AdminPageHeader'
import ProgressBar from '@/components/portal/ProgressBar'
import styles from '../../portal-admin.module.css'

export const dynamic = 'force-dynamic'

// Admin piece page (spec 2026-07-23 section 9): read + operate, NOT authoring. Leads
// with the full progress bar in place of a flat status. Content authoring stays in the
// canonical CLI pen; this page surfaces where the piece stands and its step detail.
export default async function AdminPiecePage({ params }: { params: Promise<{ contentId: string }> }) {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')

  const { contentId } = await params
  const admin = createSupabaseAdmin()
  // Single-client launch: resolve Kanset explicitly so the piece read stays
  // (client_id, content_id) tenant-scoped. The clientSlug route segment lands when a
  // second client appears (spec 9).
  const client = await admin.from('clients').select('id').eq('slug', 'kanset').single()
  if (client.error || !client.data) notFound()
  const cid = decodeURIComponent(contentId)
  const piece = await loadAgencyStagePiece(admin, client.data.id, cid)
  if (!piece) notFound()

  // The gate loader is lean (no copy). Pull the working version's client-safe content
  // separately so the piece page shows the actual copy + design, not just progress.
  const itemRow = await admin.from('content_items').select('id, working_version')
    .eq('client_id', client.data.id).eq('content_id', cid).single()
  const versionRow = itemRow.data?.working_version != null ? await admin.from('content_item_versions')
    .select('copy_blocks, client_body, canva_url, drive_url')
    .eq('content_item_id', itemRow.data.id).eq('version', itemRow.data.working_version).single() : null
  const content = versionRow?.data as {
    copy_blocks: unknown; client_body: string | null; canva_url: string | null; drive_url: string | null
  } | null | undefined
  const blocks = Array.isArray(content?.copy_blocks)
    ? content!.copy_blocks as Array<{ key: string | null; label: string; body: string }> : []
  const canva = content?.canva_url && /^https:\/\//i.test(content.canva_url) ? content.canva_url : null
  const drive = content?.drive_url && /^https:\/\//i.test(content.drive_url) ? content.drive_url : null

  const model = agencyProgress(piece)
  const gates = resolveNineGates(piece)
  const meta = [
    piece.pillar, piece.format,
    piece.producer === 'the_dot' ? 'The Dot' : piece.producer === 'studio' ? 'Studio' : null,
    piece.platforms.length ? piece.platforms.join(' · ') : null,
  ].filter(Boolean).join('  ·  ')

  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <Link href="/admin/portal/pieces"
          style={{ fontFamily: 'var(--dot-font-text)', fontSize: 13, color: 'var(--dot-graphite)', textDecoration: 'none' }}>
          ← All pieces
        </Link>
      </div>

      <AdminPageHeader kicker="Agency ops · Piece" title={piece.title} display intro={meta} />

      <section className={styles.card}>
        <div className={styles.panelHead}><Eyebrow tone="grey">Progress</Eyebrow></div>
        <ProgressBar model={model} />
        <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap',
          fontFamily: 'var(--dot-font-text)', fontSize: 12, color: 'var(--dot-grey)' }}>
          <span>Working v{piece.workingVersion ?? '—'}</span>
          <span>{piece.released ? `Shared with Maria (v${piece.visibleVersion})` : 'Not shared yet'}</span>
        </div>
      </section>

      {piece.calendarNote && (
        <section className={styles.card}>
          <div className={styles.panelHead}><Eyebrow tone="grey">Note</Eyebrow></div>
          <Text>{piece.calendarNote}</Text>
        </section>
      )}

      <section className={styles.card}>
        <div className={styles.panelHead}><Eyebrow tone="grey">Content</Eyebrow></div>
        {blocks.length > 0 ? (
          blocks.map((b, i) => (
            <div key={b.key ?? `block-${i}`} style={{ marginBottom: 18 }}>
              {b.label && <div style={{ fontFamily: 'var(--dot-font-text)', fontSize: 12,
                textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--dot-graphite)', marginBottom: 6 }}>{b.label}</div>}
              <div style={{ fontFamily: 'var(--dot-font-text)', fontSize: 15, lineHeight: 1.55,
                color: 'var(--dot-black)', whiteSpace: 'pre-wrap', maxWidth: '65ch' }}>{b.body}</div>
            </div>
          ))
        ) : content?.client_body ? (
          <div style={{ fontFamily: 'var(--dot-font-text)', fontSize: 15, lineHeight: 1.55,
            color: 'var(--dot-black)', whiteSpace: 'pre-wrap', maxWidth: '65ch' }}>{content.client_body}</div>
        ) : (
          <Text tone="grey">No copy synced for this version yet.</Text>
        )}
        {(canva || drive) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {canva && <Button as="a" href={canva} target="_blank" rel="noreferrer" variant="yellow" size="sm">Open design in Canva</Button>}
            {drive && <Button as="a" href={drive} target="_blank" rel="noreferrer" variant="ghost" size="sm">Open in Drive</Button>}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.panelHead}><Eyebrow tone="grey">Step detail</Eyebrow></div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {gates.map((gate, i) => (
            <li key={`${gate.key}-${gate.dest ?? i}`}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0',
                borderBottom: '1px solid var(--dot-hairline)', fontFamily: 'var(--dot-font-text)', fontSize: 13 }}>
              <span style={{ color: 'var(--dot-black)' }}>
                {AGENCY_LABELS[gate.key]}{gate.dest ? `: ${gate.dest}` : ''}
              </span>
              <span style={{ color: 'var(--dot-grey)', textAlign: 'right' }}>
                {gate.present ? gate.state : 'not tracked'}
                {gate.date ? ` · ${gate.date}` : ''}
                {gate.owner ? ` · ${gate.owner}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
