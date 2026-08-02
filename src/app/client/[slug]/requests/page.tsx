import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import { getClientSession } from '@/lib/portal/auth'
import { getContent } from '@/lib/portal/data'
import { getContentRequestMessages, getContentRequests } from '@/lib/portal/requests'
import { getClientProposalMessages, getClientProposals } from '@/lib/portal/proposals'
import NewContentRequestForm from './NewContentRequestForm'
import RequestHistory from './RequestHistory'
import Link from 'next/link'
import styles from './requests.module.css'

export default async function RequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const [requests, content, proposals] = await Promise.all([
    getContentRequests(session.clientId), getContent(session.clientId), getClientProposals(session.clientId),
  ])
  const [messages, proposalMessages] = await Promise.all([
    getContentRequestMessages(session.clientId, requests.map((request) => request.id)),
    getClientProposalMessages(session.clientId, proposals.map((proposal) => proposal.id)),
  ])
  return <main className={styles.wrap}>
    <Eyebrow tone="grey">Messages & requests</Eyebrow>
    <Heading level={1}>A clear place to decide and discuss.</Heading>
    <div className={styles.intro}><Text tone="graphite">
      Review proposals from The Dot, leave a reply, or request a content change. Nothing here silently rewrites released copy.
    </Text></div>
    <div className={styles.grid}>
      <section className={styles.panel}>
        <Heading level={3}>Request a new piece</Heading>
        {session.canSubmitRequests
          ? <NewContentRequestForm slug={slug} initialKey={randomUUID()} />
          : <Text tone="grey">This workspace is read-only for your account.</Text>}
      </section>
      <section aria-labelledby="request-history-heading">
        <div id="request-history-heading"><Heading level={3}>Messages from The Dot</Heading></div>
        {proposals.length === 0 ? <Text tone="grey">No proposals yet.</Text> : <div className={styles.history}>{proposals.map((proposal) => {
          const replies = proposalMessages.filter((message) => message.proposal_id === proposal.id)
          return <article className={styles.card} key={proposal.id}>
            <div className={styles.cardHead}><div><Text as="div" tone="black"><strong>{proposal.title}</strong></Text><Text as="div" size="sm" tone="grey">Proposal · v{proposal.revision}{replies.length ? ` · ${replies.length} message${replies.length === 1 ? '' : 's'}` : ''}</Text></div><span className={styles.badge}>{proposal.status === 'awaiting_decision' ? 'Your decision' : proposal.status.replaceAll('_', ' ')}</span></div>
            {proposal.summary && <div className={styles.copy}><Text as="div" size="sm">{proposal.summary}</Text></div>}
            <p><Link href={`/client/${encodeURIComponent(slug)}/requests/proposals/${encodeURIComponent(proposal.proposal_key)}`}>{proposal.status === 'awaiting_decision' ? 'Review and decide' : 'Open conversation'}</Link></p>
          </article>
        })}</div>}
        <div className={styles.requestHistoryHeading}><Heading level={3}>Content request history</Heading></div>
        <RequestHistory slug={slug} requests={requests} messages={messages} content={content}
          canReply={session.canSubmitRequests} />
      </section>
    </div>
  </main>
}
