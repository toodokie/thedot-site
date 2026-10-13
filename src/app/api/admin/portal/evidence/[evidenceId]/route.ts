import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ evidenceId: string }> },
) {
  try {
    await requireAdminSession()
    const { evidenceId } = await params
    const admin = createSupabaseAdmin()
    const { data: evidence, error } = await admin.from('publication_evidence')
      .select('object_key,evidence_url,deleted_at').eq('id', evidenceId).single()
    if (error || !evidence || evidence.deleted_at) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (evidence.evidence_url) return NextResponse.redirect(evidence.evidence_url)
    if (!evidence.object_key) return NextResponse.json({ error: 'No downloadable object' }, { status: 404 })
    const { data, error: signError } = await admin.storage
      .from('portal-publication-evidence').createSignedUrl(evidence.object_key, 60)
    if (signError) throw new Error(signError.message)
    return NextResponse.redirect(data.signedUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json({ error: 'Unauthorized' }, { status: message === 'ADMIN_AUTH_REQUIRED' ? 401 : 500 })
  }
}
