import Link from 'next/link'
import Image from 'next/image'
import { getClientSession } from '@/lib/portal/auth'
import { redirect } from 'next/navigation'
import { getContent, getActivity, type ContentRow as ContentRowType } from '@/lib/portal/data'
import { Eyebrow, Heading, Text, Button, Dot } from '@thedot/design-system'
import styles from './overview.module.css'

// One consistent section box for every group.
function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}><Eyebrow tone="grey">{label}</Eyebrow></div>
      {children}
    </section>
  )
}

// A clickable content row; `priority` shows a yellow dot marker (needs the client's eyes).
function ContentRow({ it, slug, priority }: { it: ContentRowType; slug: string; priority?: boolean }) {
  const platforms = it.platforms || []
  return (
    <Link className={styles.row} href={`/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(it.content_id)}`}>
      {priority && <span className={styles.marker}><Dot fill="yellow" size={8} /></span>}
      <span className={styles.rowMain}>
        <Text as="span" size="md" tone="black">{it.title}</Text>
        {(platforms.length > 0 || it.fact_check) && (
          <span className={styles.chipRow}>
            {platforms.map((p) => <span key={p} className={styles.chip}>{p}</span>)}
            {it.fact_check && <span className={`${styles.chip} ${styles.chipFact}`}>{it.fact_check}</span>}
          </span>
        )}
      </span>
    </Link>
  )
}

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  const [items, activity] = await Promise.all([getContent(session.clientId), getActivity(session.clientId)])
  const needs = items.filter((i) => i.state === 'needs_review')
  const withDot = items.filter((i) => i.state === 'with_dot')
  const approved = items.filter((i) => i.state === 'approved')
  const scheduled = items.filter((i) => i.state === 'scheduled')
  const live = items.filter((i) => i.state === 'live')
  const firstName = session.name ? session.name.split(' ')[0] : ''

  return (
    <main style={{ background: 'var(--dot-cream)', minHeight: '100vh' }}>
      <div className={styles.wrap}>
        <Image className={styles.logo} src="/images/logo.png" alt="The Dot Creative" width={72} height={45} priority />
        <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset · Workspace</Eyebrow></div>
        <div className={styles.greeting}>
          <Heading level={1} variant="display">Good day{firstName ? `, ${firstName}` : ''}.</Heading>
        </div>
        <div className={styles.status}>
          <Text size="lg" tone="graphite">
            {needs.length === 0
              ? "You're all caught up."
              : <><span className={styles.statusCount}>{needs.length}</span> waiting for you.</>}
          </Text>
        </div>

        <div className={styles.grid}>
          <div>
            <Panel label="Needs your approval">
              {needs.length === 0 ? (
                <div className={styles.emptyRow}><Text size="md" tone="graphite">Nothing needs your approval right now.</Text></div>
              ) : (
                needs.map((it) => <ContentRow key={it.id} it={it} slug={slug} priority />)
              )}
            </Panel>

            {withDot.length > 0 && (
              <Panel label="Back with The Dot">
                {withDot.map((it) => (
                  <div key={it.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <Text as="span" size="md" tone="graphite">{it.title}</Text>{' '}
                      <Text as="span" size="sm" tone="grey">(we are revising this)</Text>
                    </span>
                  </div>
                ))}
              </Panel>
            )}

            {approved.length > 0 && <Panel label="Approved">{approved.map((it) => <ContentRow key={it.id} it={it} slug={slug} />)}</Panel>}
            {scheduled.length > 0 && <Panel label="Scheduled">{scheduled.map((it) => <ContentRow key={it.id} it={it} slug={slug} />)}</Panel>}
            {live.length > 0 && <Panel label="Published">{live.map((it) => <ContentRow key={it.id} it={it} slug={slug} />)}</Panel>}
          </div>

          <aside>
            <Panel label="Activity">
              {activity.length === 0 ? (
                <div className={styles.emptyRow}><Text size="md" tone="graphite">No activity yet.</Text></div>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <Text as="div" size="sm" tone="graphite">{a.actor_name} · {a.title}</Text>
                      {a.summary && <Text as="div" size="sm" tone="graphite">{a.summary}</Text>}
                      <time className={styles.activityDate} dateTime={a.created_at}>{a.created_at.slice(0, 10)}</time>
                    </span>
                  </div>
                ))
              )}
            </Panel>
          </aside>
        </div>

        <form className={styles.signout} action="/client/logout" method="post">
          <Button as="button" type="submit" variant="ghost" size="sm">Sign out</Button>
        </form>
      </div>
    </main>
  )
}
