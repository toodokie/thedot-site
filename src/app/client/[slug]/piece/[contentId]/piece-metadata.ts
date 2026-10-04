import type { Metadata } from 'next'
import { cache } from 'react'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { clientDisplayName, PORTAL_NOINDEX, portalShareMetadata } from '../../../portal-share-metadata'

// One RLS-bound read per request, shared by generateMetadata and the page (React cache is
// request-scoped on the server, like getClientSession's).
export const getPieceItem = cache(getContentItem)

// Spec 9.4: the tab and share title read "Kanset · <piece title>" and the page is never indexed.
// The title is resolved with the VIEWER's session and RLS. Anyone who cannot see the piece gets
// the generic portal title, and no lookup failure can put piece data or error text in the head.
export async function resolvePieceMetadata(slug: string, contentId: string): Promise<Metadata> {
  const client = clientDisplayName(slug)
  const titled = (title: string): Metadata => ({ title, robots: PORTAL_NOINDEX, ...portalShareMetadata(title) })
  const generic = titled(`${client} · Client Portal`)
  try {
    const session = await getClientSession(slug)
    if (!session) return generic
    const item = await getPieceItem(session.clientId, contentId)
    const pieceTitle = item?.title?.trim()
    if (!pieceTitle) return generic
    return titled(`${client} · ${pieceTitle}`)
  } catch {
    return generic
  }
}
