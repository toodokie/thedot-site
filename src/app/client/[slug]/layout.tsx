import Image from 'next/image'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import PortalNav from './PortalNav'
import AssistantWidget from './assistant/AssistantWidget'
import styles from './portal-shell.module.css'

// Private workspace: a real tab title instead of the marketing site's, and never indexed.
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const name = slug.charAt(0).toUpperCase() + slug.slice(1)
  return {
    title: `${name} · Client Portal`,
    // Installable-app manifest: opens straight to the workspace, own name + icon ("Kanset Portal").
    manifest: '/kanset-portal.webmanifest',
    robots: { index: false, follow: false },
  }
}

export default async function ClientWorkspaceLayout(
  { children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const session = await getClientSession(slug)
  // null = logged out OR authenticated-but-not-a-member of this client; both redirect to login.
  // Secure and privacy-safe for the single-client (Kanset) launch, where the forbidden case is
  // unreachable. DEFERRED before multi-client: distinguish the two (logged out -> login,
  // authenticated-but-forbidden -> notFound) via a discriminated getClientSession result.
  if (!session) redirect('/client/login')
  // The Assistant nav entry needs BOTH the member capability and the fail-closed
  // 'assistant' feature switch (same gate RPC the API runs), so a provisioned member
  // never sees a dead entry while the switch is off.
  let assistantAvailable = false
  if (session.canUseAssistant) {
    const supabase = await createSupabaseServer()
    const gate = await supabase.rpc('portal_assistant_gate', { p_client_id: session.clientId })
    assistantAvailable = !gate.error
  }
  // Seat indicator: any window instantly shows whose seat it is (the preview seat
  // greeted Anastasia as Maria once). "(preview)" in the member name gets a chip.
  const isPreview = /\(preview\)/i.test(session.name ?? '')
  const seat = (
    <span className={styles.seat}>
      Signed in as {session.name}
      {isPreview && <span className={styles.previewChip}>preview</span>}
    </span>
  )
  return (
    <div className={styles.shell}>
      <PortalNav slug={slug} showAssistant={assistantAvailable} seat={seat} />
      <div className={styles.content}>
        <header className={styles.topbar}>
          <Image src="/images/logo.png" alt="The Dot Creative" width={64} height={36} priority />
          {seat}
        </header>
        <main className={styles.main}>{children}</main>
      </div>
      {assistantAvailable && (
        <AssistantWidget slug={session.clientSlug} storageScope={session.userId} />
      )}
    </div>
  )
}
