import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import { getClientSession } from '@/lib/portal/auth'
import { getClientProposal, getClientProposalMessages } from '@/lib/portal/proposals'
import ProposalDocument from '../../ProposalDocument'
import ProposalConversation from '../../ProposalConversation'
import ProposalDecisionForm from '../../ProposalDecisionForm'
import styles from '../../requests.module.css'

export default async function ProposalPage({ params }: { params: Promise<{ slug: string; proposalKey: string }> }) {
  const { slug, proposalKey } = await params; const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const proposal = await getClientProposal(session.clientId, proposalKey); if (!proposal) notFound()
  const messages = await getClientProposalMessages(session.clientId, [proposal.id])
  return <main className={styles.wrap}><p><Link href={`/client/${encodeURIComponent(slug)}/requests`}>Back to messages</Link></p>
    <Eyebrow tone="grey">Proposal</Eyebrow><Heading level={1}>{proposal.title}</Heading>
    {proposal.summary && <div className={styles.intro}><Text tone="graphite">{proposal.summary}</Text></div>}
    <div className={styles.proposalLayout}><article className={styles.proposalPanel}><ProposalDocument proposal={proposal} /></article>
      <aside className={styles.proposalSide}>
        <section className={styles.panel}><Heading level={3}>{proposal.status === 'awaiting_decision' ? 'Your decision' : 'Decision'}</Heading>
          {proposal.status === 'awaiting_decision' ? session.canDecide ? <ProposalDecisionForm slug={slug} proposalKey={proposalKey} /> : <Text tone="grey">This review is waiting for the primary decision-maker.</Text>
            : <><Text tone="graphite">{proposal.status === 'approved' ? `Approved by ${proposal.decided_by_name ?? 'the client'}.` : proposal.status === 'change_requested' ? 'Changes requested.' : 'Closed.'}</Text>{proposal.decision_note && <p className={styles.copy}>{proposal.decision_note}</p>}</>}
        </section><section className={styles.panel}><Heading level={3}>Conversation</Heading><ProposalConversation slug={slug} proposalKey={proposalKey} messages={messages} canReply={session.canSubmitRequests} /></section>
      </aside>
    </div>
  </main>
}
