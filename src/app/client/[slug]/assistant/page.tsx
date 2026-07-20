import { notFound, redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import AssistantChat from './AssistantChat'
import styles from './assistant.module.css'

// The Client Work Assistant page. Reachable only when the member holds the
// can_use_assistant capability AND the fail-closed 'assistant' feature switch is on
// (checked in the database via the same gate RPC the API uses); everyone else gets a
// 404 so the surface never advertises a dead or ungranted feature. The API route
// re-runs the gate on every question, so this page gating is UX, not the boundary.

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canUseAssistant) notFound()
  const supabase = await createSupabaseServer()
  const gate = await supabase.rpc('portal_assistant_gate', { p_client_id: session.clientId })
  if (gate.error) notFound()

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset · Assistant</Eyebrow></div>
      <div className={styles.header}><Heading level={2}>Ask about your account</Heading></div>
      <div className={styles.intro}>
        <Text size="lg" tone="graphite">
          Answers about your account come from your own portal data, cited to the exact
          portal item. General immigration questions are answered from official public
          sources, with visible links to every source.
        </Text>
      </div>
      <AssistantChat slug={session.clientSlug} />
    </div>
  )
}
