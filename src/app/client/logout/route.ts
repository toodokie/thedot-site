import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
export async function POST(request: Request) {
  const supabase = await createSupabaseServer({ writable: true })
  const { error } = await supabase.auth.signOut({ scope: 'local' }) // this device only
  if (error) {
    return NextResponse.json(
      { error: 'Unable to sign out' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  // 303 See Other: the browser follows with GET (a 307 would re-POST to the GET-only login route).
  return NextResponse.redirect(new URL('/client/login', request.url), {
    status: 303,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
