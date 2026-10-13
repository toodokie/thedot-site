import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifySession } from '@/lib/auth'
import { resolveNineGates } from '@/lib/portal/gates'
import { AGENCY_LABELS } from '@/lib/portal/progress-bar-model'
import { Eyebrow, Text } from '@thedot/design-system'
import AdminPageHeader from '../../AdminPageHeader'
import { CommentList } from '../../CommentInbox'
import { RequestList } from '../../RequestAdmin'
import adminStyles from '../../portal-admin.module.css'
import { adminPieceHref } from '@/lib/portal/admin-piece-href'
import { loadAgencyPieceData } from './agency-piece-data'
import { centreFallbackHeading } from './agency-piece-data-view'
import AgencyPieceCenter from './AgencyPieceCenter'
import AgencyPanel from './AgencyPanel'
import AgencyStateBar from './AgencyStateBar'
import WorkingCopy from './WorkingCopy'
import styles from './agency-panel.module.css'

export const dynamic = 'force-dynamic'

// Admin piece page (spec 2026-10-03 section 8): Maria's exact page, read-only, plus the agency
// panel. Read and operate, not authoring: content still changes only through the canonical CLI.
// The reply threads and the full step detail stay below the layout: the panel summarises, they operate.
export default async function AdminPiecePage({ params, searchParams }: {
  params: Promise<{ contentId: string }>
  searchParams: Promise<{ client?: string }>
}) {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const { contentId } = await params
  const { client } = await searchParams
  const data = await loadAgencyPieceData(decodeURIComponent(contentId), client ?? null)
  if (!data) notFound()
  // content_id is unique per client only: when two clients share one, ask which piece is meant.
  if ('ambiguous' in data) return (
    <>
      <Link href="/admin/portal/pieces" className={styles.back}>← All pieces</Link>
      <AdminPageHeader kicker="Agency ops · Piece" title={data.contentId} display intro="More than one client has a piece with this id. Choose the client." />
      <ul className={styles.rows}>
        {data.clients.map((option) => <li key={option.slug}>
          <Link href={adminPieceHref(data.contentId, option.slug)}>{option.name}</Link>
        </li>)}
      </ul>
    </>
  )
  const { piece } = data
  const meta = [
    piece.pillar, piece.format,
    piece.producer === 'the_dot' ? 'The Dot' : piece.producer === 'studio' ? 'Studio' : null,
    piece.platforms.length ? piece.platforms.join(' · ') : null,
  ].filter(Boolean).join('  ·  ')
  const workingIsAhead = piece.workingVersion != null
    && (piece.visibleVersion == null || piece.workingVersion > piece.visibleVersion)
  const released = Boolean(piece.released)
  const gates = resolveNineGates(piece)

  return (
    <>
      <Link href="/admin/portal/pieces" className={styles.back}>← All pieces</Link>
      <AdminPageHeader kicker="Agency ops · Piece" title={piece.title} display intro={meta} />
      {data.mariaPreviewError && <p className={`${styles.alert} ${styles.danger}`} role="alert">
        Maria&apos;s view could not load: {data.mariaPreviewError}
      </p>}

      <AgencyPieceCenter
        contentId={data.contentId}
        preview={data.mariaPreview}
        layout={data.mariaLayout}
        previews={data.previews}
        ticks={data.mariaTicks}
        optionPicks={data.mariaOptionPicks}
        fallback={<WorkingCopy heading={centreFallbackHeading(released, piece.workingVersion)}
          blocks={data.working.blocks} clientBody={data.working.clientBody}
          canva={data.design.canva} drive={data.design.drive} />}
        sidePanel={<AgencyPanel model={{ ...data, released }} />}
        bottomBar={<AgencyStateBar contentId={data.contentId} clientSlug={data.clientSlug} line={data.barLine} released={released} />}
      />

      <div className={styles.below}>
        {piece.calendarNote && <section className={styles.card}>
          <Eyebrow tone="grey">Note</Eyebrow>
          <Text>{piece.calendarNote}</Text>
        </section>}
        {data.mariaPreview && workingIsAhead && <WorkingCopy
          heading={`Working copy, v${piece.workingVersion}, not shared yet`}
          blocks={data.working.blocks} clientBody={data.working.clientBody}
          canva={data.design.canva} drive={data.design.drive} />}
        <section className={adminStyles.card}>
          <div className={adminStyles.panelHead}><Eyebrow tone="grey">Client comments</Eyebrow></div>
          <p className={adminStyles.panelNote}>Comments on this piece’s copy or linked design, with the full reply thread in one place.</p>
          <CommentList comments={data.comments} showPieceLink={false} emptyLabel="Maria has not left a comment on this piece yet." />
        </section>
        <section className={adminStyles.card}>
          <div className={adminStyles.panelHead}><Eyebrow tone="grey">Requests</Eyebrow></div>
          <p className={adminStyles.panelNote}>Her exact text, the conversation, and your replies. Reply here before you prepare a canonical revision.</p>
          <RequestList requests={data.requests} showPieceTitle={false} emptyLabel="Maria has not sent a request for this piece yet." />
        </section>
        <section className={adminStyles.card}>
          <div className={adminStyles.panelHead}><Eyebrow tone="grey">Step detail</Eyebrow></div>
          <ul className={styles.rows}>
            <li><span>Idea sent to Maria</span>
              <span className={styles.when}>{piece.ideaApprovalSentAt ? `done · ${piece.ideaApprovalSentAt.slice(0, 10)}` : 'not tracked'}</span></li>
            <li><span>Idea approved</span>
              <span className={styles.when}>{piece.ideaDecision ?? 'open'} · maria{piece.ideaDecisionSource ? ` · ${piece.ideaDecisionSource}` : ''}</span></li>
            {gates.map((gate, index) => <li key={`${gate.key}-${gate.dest ?? index}`}>
              <span>{AGENCY_LABELS[gate.key]}{gate.dest ? `: ${gate.dest}` : ''}</span>
              <span className={styles.when}>
                {gate.present ? gate.state : 'not tracked'}{gate.date ? ` · ${gate.date}` : ''}{gate.owner ? ` · ${gate.owner}` : ''}
              </span>
            </li>)}
          </ul>
        </section>
      </div>
    </>
  )
}
