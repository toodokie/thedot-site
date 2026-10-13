import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getIdeaComments, getIdeas } from '@/lib/portal/ideas'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import IdeasBoard from './IdeasBoard'
import styles from './ideas.module.css'

export default async function IdeasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  const [ideas, comments] = await Promise.all([
    getIdeas(session.clientId),
    getIdeaComments(session.clientId),
  ])

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Eyebrow tone="grey">Kanset · Idea inbox</Eyebrow>
        <div className={styles.title}><Heading level={2} variant="section">Idea inbox</Heading></div>
        <Text size="md" tone="graphite">
          Drop a post idea, a question, a story worth telling, anything you want us to shape into content.
          We pick it up from here.
        </Text>
      </div>

      <IdeasBoard slug={slug} ideas={ideas} comments={comments}
        canSubmit={session.canSubmitRequests} canComment={session.canComment} />
    </div>
  )
}
