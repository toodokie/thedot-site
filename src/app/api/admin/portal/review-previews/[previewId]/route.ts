import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin-security'
import { getAgencyReviewPreviewById } from '@/lib/portal/review-previews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'private, no-store' }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ previewId: string }> },
) {
  try {
    await requireAdminSession()
    const { previewId } = await params
    const preview = await getAgencyReviewPreviewById(previewId)
    if (!preview) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ preview }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json(
      { error: message === 'ADMIN_AUTH_REQUIRED' ? 'Unauthorized' : 'Preview unavailable' },
      { status: message === 'ADMIN_AUTH_REQUIRED' ? 401 : 500, headers: NO_STORE },
    )
  }
}
