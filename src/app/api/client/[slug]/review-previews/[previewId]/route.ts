import { NextResponse } from 'next/server'
import { getClientSession } from '@/lib/portal/auth'
import { getClientReviewPreviewById } from '@/lib/portal/review-previews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'private, no-store' }

// Fresh signed links for one preview, used when the ten-minute links expire mid-review. The client
// id comes from the seat's session, and the row itself is read under RLS, so a seat can only ever
// refresh a preview it could already see.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; previewId: string }> },
) {
  const { slug, previewId } = await params
  try {
    const session = await getClientSession(slug)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    const preview = await getClientReviewPreviewById(session.clientId, previewId)
    if (!preview) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ preview }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Preview unavailable' }, { status: 500, headers: NO_STORE })
  }
}
