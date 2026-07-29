import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import { getClientSession } from '@/lib/portal/auth'
import { getContent } from '@/lib/portal/data'
import { getContentRequestMessages, getContentRequests } from '@/lib/portal/requests'
import NewContentRequestForm from './NewContentRequestForm'
import RequestHistory from './RequestHistory'
import styles from './requests.module.css'

export default async function RequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const [requests, content] = await Promise.all([
    getContentRequests(session.clientId), getContent(session.clientId),
  ])
  const messages = await getContentRequestMessages(session.clientId, requests.map((request) => request.id))
  return <main className={styles.wrap}>
    <Eyebrow tone="grey">Content requests</Eyebrow>
    <Heading level={1}>Ask for what you need.</Heading>
    <div className={styles.intro}><Text tone="graphite">
      Requests stay visible while The Dot prepares and reviews the canonical version. Nothing here silently rewrites released copy.
    </Text></div>
    <div className={styles.grid}>
      <section className={styles.panel}>
        <Heading level={3}>Request a new piece</Heading>
        {session.canSubmitRequests
          ? <NewContentRequestForm slug={slug} initialKey={randomUUID()} />
          : <Text tone="grey">This workspace is read-only for your account.</Text>}
      </section>
      <section aria-labelledby="request-history-heading">
        <div id="request-history-heading"><Heading level={3}>Request history</Heading></div>
        <RequestHistory slug={slug} requests={requests} messages={messages} content={content}
          canReply={session.canSubmitRequests} />
      </section>
    </div>
  </main>
}
