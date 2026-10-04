'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { MAX_EDIT_CHARS } from '@/lib/portal/piece-page/limits'
import { resolvePieceAction } from '@/lib/portal/piece-page/piece-action'
import { draftIdentity, type ServerDraftRow } from '@/lib/portal/review-drafts-core'
import ReviewDraftProvider, { useReviewDrafts, type ReviewDraft } from '../ReviewDraftProvider'
import CarriedDraftNotice from './CarriedDraftNotice'
import CopySwitcher, { tabDomId } from './CopySwitcher'
import DecisionBar from './DecisionBar'
import type { WorkspaceData, WorkspaceMode } from './derive'
import EditorHost, { useEditorHost } from './EditorHost'
import FirstVisitIntro from './FirstVisitIntro'
import { usePhone, useSwipe } from './hooks'
import MediaArea from './MediaArea'
import PieceHeader from './PieceHeader'
import QuestionsDrawer, { type DrawerTab } from './QuestionsDrawer'
import ReviewTicksProvider, { useReviewTicks } from './ReviewTicksProvider'
import ScheduleRequest from './ScheduleRequest'
import ArticlePanel from './panels/ArticlePanel'
import ChaptersPanel from './panels/ChaptersPanel'
import CopyPanel from './panels/CopyPanel'
import CoverImagePanel from './panels/CoverImagePanel'
import DocumentPanel from './panels/DocumentPanel'
import OnScreenTextPanel from './panels/OnScreenTextPanel'
import SearchSharingPanel from './panels/SearchSharingPanel'
import YouTubePanel from './panels/YouTubePanel'
import styles from './piece-page.module.css'

// The redesigned client piece page (spec 2026-10-03). One component tree for the client seat and
// the read-only "View as Maria" preview (mode), so plan 5 can add the agency view without a fork.
export default function PieceWorkspace({ data, mode, draftScope, serverDrafts, ticks }: {
  data: WorkspaceData
  mode: WorkspaceMode
  draftScope: string
  serverDrafts: ServerDraftRow[] | null
  ticks: string[]
}) {
  // Keyed by version, as the current page is, so a new release re-reconciles drafts and ticks.
  return <ReviewDraftProvider key={data.version} draftScope={draftScope} slug={data.slug} contentId={data.contentId} version={data.version}
    serverSync={mode === 'client' && Array.isArray(serverDrafts)} initialServerDrafts={serverDrafts}>
    <ReviewTicksProvider key={data.version} slug={data.slug} contentId={data.contentId} version={data.version} scope={draftScope}
      initial={ticks} persist={mode === 'client'}>
      <EditorHost mode={mode}>
        <WorkspaceBody data={data} mode={mode} />
      </EditorHost>
    </ReviewTicksProvider>
  </ReviewDraftProvider>
}

function countDraftsByTab(tabs: CopyTab[], drafts: ReviewDraft[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const tab of tabs) {
    if (tab.kind === 'chapters') continue
    const keys = new Set(tab.blocks.map((block) => block.key).filter((key): key is string => Boolean(key)))
    const count = drafts.filter((draft) => draft.kind === 'copy_block' && keys.has(draft.key)).length
    if (count > 0) counts[tab.key] = count
  }
  return counts
}

function WorkspaceBody({ data, mode }: { data: WorkspaceData; mode: WorkspaceMode }) {
  const { currentDrafts, carriedDrafts, syncState } = useReviewDrafts()
  const { ticked, tick } = useReviewTicks()
  const { open } = useEditorHost()
  const isPhone = usePhone()
  const [active, setActive] = useState(data.tabs[0]?.key ?? '')
  const [page, setPage] = useState(0)
  const [drawer, setDrawer] = useState<{ open: boolean; tab: DrawerTab }>({ open: false, tab: 'conversation' })

  useEffect(() => { if (active) tick(active) }, [active, tick])

  const index = Math.max(0, data.tabs.findIndex((tab) => tab.key === active))
  const activeTab = data.tabs[index] ?? null
  const select = (next: number) => {
    const tab = data.tabs[Math.min(data.tabs.length - 1, Math.max(0, next))]
    if (tab) setActive(tab.key)
  }
  const swipe = useSwipe(() => select(index + 1), () => select(index - 1))

  const draftCounts = useMemo(() => countDraftsByTab(data.tabs, [...currentDrafts, ...carriedDrafts]),
    [carriedDrafts, currentDrafts, data.tabs])
  const unticked = data.tabs.filter((tab) => !ticked.has(tab.key))
  const action = resolvePieceAction({
    isPublished: data.isPublished,
    state: data.state,
    revisionStarted: data.revisionStarted,
    currentDraftCount: currentDrafts.length,
    carriedDraftCount: carriedDrafts.length,
    sentUnresolvedCount: data.sentSummary.count,
    packageReady: data.packageReady,
    missing: data.missing,
    canDecide: data.canDecide,
    tabsTotal: data.tabs.length,
    tabsTicked: data.tabs.length - unticked.length,
    untickedLabels: unticked.map((tab) => tab.label),
    mediaPending: data.mediaPending,
    sendFailed: syncState === 'send_failed',
    overLimit: currentDrafts.some((draft) => draft.proposedText.length > MAX_EDIT_CHARS),
  })

  const visual = data.visualTarget
  const frames = data.preview?.frames ?? []
  const canSuggest = data.canEdit && visual !== null
  function suggest(at: number | null) {
    if (!visual) return
    const anchored = at !== null && visual.anchors
    const word = data.layout === 'pages' ? 'page' : 'frame'
    const label = `${word === 'page' ? 'Page' : 'Frame'} ${(at ?? 0) + 1}`
    open({
      kind: 'note',
      target: {
        kind: visual.kind, key: visual.key, label: visual.label, urlSnapshot: visual.url,
        anchor: anchored ? `${word}:${(at as number) + 1}` : '', anchorLabel: anchored ? label : null,
      },
      title: anchored ? `${label} of ${frames.length} · Suggest a change` : `${visual.label} · Suggest a change`,
      thumbUrl: anchored ? frames[at as number]?.url ?? null : null,
    })
  }

  function showCarried() {
    const first = carriedDrafts[0]
    if (!first) return
    const tab = first.kind === 'copy_block'
      ? data.tabs.find((t) => t.kind !== 'chapters' && t.blocks.some((block) => block.key === first.key))
      : null
    if (tab) setActive(tab.key)
    window.requestAnimationFrame(() => {
      document.getElementById(`carried-${draftIdentity(first)}`)?.scrollIntoView?.({ block: 'center' })
    })
  }

  const before = data.beforeByBlock
  let panel = <p className={styles.meta}>No copy for this piece yet.</p>
  if (activeTab) {
    switch (activeTab.kind) {
      case 'onscreen':
        panel = <OnScreenTextPanel tab={activeTab} frames={frames} before={before} canEdit={data.canEdit}
          onSuggestFrame={canSuggest && visual?.anchors ? (at) => suggest(at) : null} version={data.version} />
        break
      case 'youtube':
        panel = <YouTubePanel tab={activeTab} before={before} canEdit={data.canEdit} version={data.version} />
        break
      case 'chapters':
        panel = <ChaptersPanel tab={activeTab} canEdit={data.canEdit} version={data.version} />
        break
      case 'document':
        panel = <DocumentPanel tab={activeTab} page={page} onPageChange={setPage}
          pageThumbs={data.preview?.mediaKind === 'pages' ? data.preview.frames : []} before={before}
          canEdit={data.canEdit} version={data.version} />
        break
      case 'article':
        panel = <ArticlePanel tab={activeTab} coverUrl={data.cover?.previewUrl ?? null} before={before}
          canEdit={data.canEdit} version={data.version} />
        break
      case 'seo':
        panel = <SearchSharingPanel tab={activeTab} canEdit={data.canEdit} version={data.version} />
        break
      case 'cover':
        panel = <CoverImagePanel cover={data.cover} onSuggest={canSuggest ? () => suggest(null) : null} />
        break
      default:
        panel = <CopyPanel tab={activeTab} before={before} canEdit={data.canEdit} version={data.version} />
    }
  }

  const visualCarried = carriedDrafts.filter((draft) => draft.kind !== 'copy_block')
  const copy = <section aria-label="Copy">
    {visualCarried.map((draft) => <CarriedDraftNotice key={draftIdentity(draft)} draft={draft} currentText="" version={data.version} />)}
    {data.tabs.length > 0 && <CopySwitcher idPrefix="piece" tabs={data.tabs} active={activeTab?.key ?? ''} onSelect={setActive}
      ticked={ticked} draftCounts={draftCounts} updated={new Set(data.updatedTabKeys)} />}
    <div role="tabpanel" id="piece-panel" aria-labelledby={activeTab ? tabDomId('piece', activeTab.key) : undefined}
      className={styles.sheet} tabIndex={0} {...(isPhone ? swipe : {})}>
      {panel}
    </div>
  </section>

  const media = data.layout === 'vertical' || data.layout === 'horizontal' || data.layout === 'pages'
    ? <MediaArea layout={data.layout} title={data.title} preview={data.preview} refreshUrl={data.previewRefreshUrl}
      fallbackMedia={data.fallbackMedia} episodeDriveUrl={data.episodeDriveUrl} mediaPending={data.mediaPending}
      framesCollapsed={activeTab?.kind === 'onscreen'} page={page} onPageChange={setPage}
      onSuggestWhole={canSuggest ? () => suggest(null) : null}
      onSuggestAt={canSuggest && visual?.anchors ? (at) => suggest(at) : null}
      playbackReport={mode === 'client' ? { slug: data.slug, contentId: data.contentId } : null} />
    : null

  return <div className={styles.root} data-piece-page-v2="" data-layout={data.layout}>
    <PieceHeader title={data.title} formatLabel={data.formatLabel} backHref={data.backHref} backLabel={data.backLabel}
      status={data.status} updatedLine={data.updatedLine} questionsCount={data.comments.length}
      onOpenQuestions={() => setDrawer({ open: true, tab: 'conversation' })} removal={data.removal}
      scheduleSlot={<ScheduleRequest slug={data.slug} contentId={data.contentId} canRequest={data.canRequestSchedule}
        hasExternalTargets={data.scheduleHasExternalTargets} active={data.activeScheduleRequest} />} />
    <div className={styles.page}>
      {data.layout === 'vertical' || data.layout === 'pages'
        ? <div className={styles.split}><aside className={styles.media} aria-label="Media">{media}</aside>{copy}</div>
        : data.layout === 'horizontal'
          ? <div className={styles.stack}>{media}<div className={styles.readw}>{copy}</div></div>
          : <div className={styles.readw}>{copy}</div>}
    </div>
    <DecisionBar action={action} ticks={{ total: data.tabs.length, done: data.tabs.length - unticked.length }}
      version={data.version} reReview={data.reReview} approvedLabel={data.approvedLabel} postedLabel={data.postedLabel}
      sentSummary={data.sentSummary} slug={data.slug} contentId={data.contentId} mode={mode}
      onOpenPastEdits={() => setDrawer({ open: true, tab: 'past' })} onShowCarried={showCarried} />
    <QuestionsDrawer open={drawer.open} tab={drawer.tab} onTabChange={(tab) => setDrawer((d) => ({ ...d, tab }))}
      onClose={() => setDrawer((d) => ({ ...d, open: false }))} slug={data.slug} contentId={data.contentId}
      comments={data.comments} canComment={data.canComment} ledger={data.ledger} factCheckScope={data.factCheckScope}
      factCheckExemption={data.factCheckExemption} requests={data.requests} requestMessages={data.requestMessages}
      item={data.item} canReply={data.canSubmitRequests} />
    <FirstVisitIntro slug={data.slug} show={data.showIntro} persist={mode === 'client'} />
  </div>
}
