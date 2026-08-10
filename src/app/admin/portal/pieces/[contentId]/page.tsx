import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifySession } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { loadAgencyStagePiece } from '@/lib/portal/gates-loader'
import { agencyProgress, AGENCY_LABELS } from '@/lib/portal/progress-bar-model'
import { resolveNineGates } from '@/lib/portal/gates'
import { Eyebrow, Text, Button } from '@thedot/design-system'
import AdminPageHeader from '../../AdminPageHeader'
import { CommentList } from '../../CommentInbox'
import { RequestList } from '../../RequestAdmin'
import { loadAdminComments, loadRequests } from '../../data'
import ProgressBar from '@/components/portal/ProgressBar'
import MarkdownCopy from '@/components/portal/MarkdownCopy'
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
  // Design links are ITEM-LEVEL (migration 0020, content_design_links), not on the version
  // row and not in canonical frontmatter. Read the item-level override first; fall back to
  // any version columns for older data.
  const designRow = itemRow.data?.id ? await admin.from('content_design_links')
    .select('canva_url, drive_url')
    .eq('client_id', client.data.id).eq('content_item_id', itemRow.data.id).maybeSingle() : null
  const designLink = designRow?.data as { canva_url: string | null; drive_url: string | null } | null | undefined
  const reviewAssetRows = itemRow.data?.id && itemRow.data.working_version != null
    ? await admin.from('content_review_assets')
      .select('id, asset_key, label, channel, asset_kind, url, width_px, height_px, caption_status, review_note')
      .eq('client_id', client.data.id)
      .eq('content_item_id', itemRow.data.id)
      .eq('content_version', itemRow.data.working_version)
      .order('channel').order('asset_key')
    : null
  const reviewAssets = (reviewAssetRows?.data ?? []) as Array<{
    id: string; asset_key: string; label: string; channel: string; asset_kind: string
    url: string; width_px: number; height_px: number; caption_status: string; review_note: string | null
  }>
  const blocks = Array.isArray(content?.copy_blocks)
    ? content!.copy_blocks as Array<{ key: string | null; label: string; body: string }> : []
  const canvaRaw = designLink?.canva_url ?? content?.canva_url ?? null
  const driveRaw = designLink?.drive_url ?? content?.drive_url ?? null
  const canva = canvaRaw && /^https:\/\//i.test(canvaRaw) ? canvaRaw : null
  const drive = driveRaw && /^https:\/\//i.test(driveRaw) ? driveRaw : null
  const [comments, requests] = itemRow.data?.id
    ? await Promise.all([
      loadAdminComments({ clientId: client.data.id, contentUuid: itemRow.data.id }),
      loadRequests({ clientId: client.data.id, contentUuid: itemRow.data.id }),
    ])
    : [[], []]

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
              <MarkdownCopy body={b.body} style={{ fontSize: 15, lineHeight: 1.55, maxWidth: '65ch' }} />
            </div>
          ))
        ) : content?.client_body ? (
          <MarkdownCopy body={content.client_body} style={{ fontSize: 15, lineHeight: 1.55, maxWidth: '65ch' }} />
        ) : (
          <Text tone="grey">No copy synced for this version yet.</Text>
        )}
        {(canva || drive) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {canva && <Button as="a" href={canva} target="_blank" rel="noreferrer" variant="yellow" size="sm">Open design in Canva</Button>}
            {drive && <Button as="a" href={drive} target="_blank" rel="noreferrer" variant="ghost" size="sm">Open in Drive</Button>}
          </div>
        )}
        {reviewAssets.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--dot-font-text)', fontSize: 12,
              textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--dot-graphite)', marginBottom: 6 }}>
              Review assets
            </div>
            {reviewAssets.map((asset) => (
              <div key={asset.id} style={{ borderTop: '1px solid var(--dot-hairline)', padding: '12px 0' }}>
                <div style={{ fontFamily: 'var(--dot-font-text)', fontSize: 15, color: 'var(--dot-black)' }}>
                  {asset.label}
                </div>
                <div style={{ fontFamily: 'var(--dot-font-text)', fontSize: 12, color: 'var(--dot-grey)', marginTop: 3 }}>
                  {asset.channel} · {asset.asset_kind} · {asset.width_px} × {asset.height_px}px
                  {asset.caption_status !== 'not_applicable' ? ` · ${asset.caption_status.replaceAll('_', ' ')}` : ''}
                </div>
                {asset.review_note && <div style={{ fontFamily: 'var(--dot-font-text)', fontSize: 13,
                  color: 'var(--dot-graphite)', marginTop: 4 }}>{asset.review_note}</div>}
                <div style={{ marginTop: 8 }}>
                  <Button as="a" href={asset.url} target="_blank" rel="noreferrer" variant="ghost" size="sm">
                    Open asset
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.panelHead}><Eyebrow tone="grey">Client comments</Eyebrow></div>
        <p className={styles.panelNote}>Comments on this piece’s copy or linked design, with the full reply thread in one place.</p>
        <CommentList comments={comments} showPieceLink={false} emptyLabel="Maria has not left a comment on this piece yet." />
      </section>

      <section className={styles.card}>
        <div className={styles.panelHead}><Eyebrow tone="grey">Requests</Eyebrow></div>
        <p className={styles.panelNote}>Questions, requested edits, and their conversation. Reply here before you prepare a canonical revision.</p>
        <RequestList requests={requests} showPieceTitle={false} emptyLabel="Maria has not sent a request for this piece yet." />
      </section>

      <section className={styles.card}>
        <div className={styles.panelHead}><Eyebrow tone="grey">Step detail</Eyebrow></div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <li style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0',
            borderBottom: '1px solid var(--dot-hairline)', fontFamily: 'var(--dot-font-text)', fontSize: 13 }}>
            <span style={{ color: 'var(--dot-black)' }}>Idea sent to Maria</span>
            <span style={{ color: 'var(--dot-grey)', textAlign: 'right' }}>
              {piece.ideaApprovalSentAt ? `done · ${piece.ideaApprovalSentAt.slice(0, 10)}` : 'not tracked'}
            </span>
          </li>
          <li style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0',
            borderBottom: '1px solid var(--dot-hairline)', fontFamily: 'var(--dot-font-text)', fontSize: 13 }}>
            <span style={{ color: 'var(--dot-black)' }}>Idea approved</span>
            <span style={{ color: 'var(--dot-grey)', textAlign: 'right' }}>
              {piece.ideaDecision ?? 'open'} · maria{piece.ideaDecisionSource ? ` · ${piece.ideaDecisionSource}` : ''}
            </span>
          </li>
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
