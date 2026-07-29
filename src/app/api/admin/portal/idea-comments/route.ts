import { NextResponse } from 'next/server'
import { assertSameOriginRequest, requireAdminSession } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as {
      action?: 'comment' | 'reply'
      commentId?: string
      ideaId?: string
      body?: string
      idempotencyKey?: string
    }
    const comment = body.body?.trim()
    if (!comment || comment.length > 4000 || !body.idempotencyKey?.match(UUID)
        || (body.action === 'reply' && !body.commentId?.match(UUID))
        || (body.action === 'comment' && !body.ideaId?.match(UUID))) {
      return NextResponse.json({ error: 'Invalid idea comment.' }, { status: 400 })
    }
    const admin = createSupabaseAdmin()
    const { data, error } = body.action === 'comment'
      ? await admin.rpc('add_agency_idea_comment', {
        p_idea_id: body.ideaId,
        p_body: comment,
        p_actor_key: 'thedot-admin',
        p_idempotency_key: body.idempotencyKey,
      })
      : await admin.rpc('add_agency_idea_comment_reply', {
        p_parent_comment_id: body.commentId,
        p_body: comment,
        p_actor_key: 'thedot-admin',
        p_idempotency_key: body.idempotencyKey,
      })
    if (error) throw new Error(error.message)
    return NextResponse.json({ result: data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Idea comment reply failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, {
      status, headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}
