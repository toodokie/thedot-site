import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
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
  return <>{children}</>
}
