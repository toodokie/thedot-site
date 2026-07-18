import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getIdeas } from '@/lib/portal/ideas'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import IdeasBoard from './IdeasBoard'
import styles from './ideas.module.css'

export default async function IdeasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  const ideas = await getIdeas(session.clientId)

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Eyebrow tone="grey">Kanset · Ideas</Eyebrow>
        <div className={styles.title}><Heading level={2} variant="section">Idea board</Heading></div>
        <Text size="md" tone="graphite">
          Drop a post idea, a question, a story worth telling, anything you want us to shape into content.
          We pick it up from here.
        </Text>
      </div>

      <IdeasBoard slug={slug} ideas={ideas} />
    </div>
  )
}
