import { notFound, redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import AssistantChat from './AssistantChat'
import styles from './assistant.module.css'

// The Client Work Assistant page. Reachable only for members with the can_use_assistant
// capability (the nav entry is gated the same way); everyone else gets a 404 so the
// surface does not advertise itself. The API route re-checks the capability AND the
// fail-closed 'assistant' feature switch in the database on every question, so this
// page gating is UX, not the security boundary.

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canUseAssistant) notFound()

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset · Assistant</Eyebrow></div>
      <div className={styles.header}><Heading level={2}>Ask about your account</Heading></div>
      <div className={styles.intro}>
        <Text size="lg" tone="graphite">
          Answers come from your own portal data: content, schedule, reports, library, and
          invoices. Every answer says which portal item it came from.
        </Text>
      </div>
      <AssistantChat slug={session.clientSlug} />
    </div>
  )
}
