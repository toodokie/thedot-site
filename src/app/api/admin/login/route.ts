import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, createSession } from '@/lib/auth';
import { createHash } from 'node:crypto';
import { assertSameOriginRequest } from '@/lib/admin-security';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request);
    const clientIP = (request.headers.get('x-forwarded-for')?.split(',')[0]
      ?? request.headers.get('x-real-ip') ?? 'unknown').trim();
    const keyHash = createHash('sha256').update(`admin-login:${clientIP}`).digest('hex');
    // Rate limit via Supabase (distributed). If the Supabase admin client or its
    // rate-limit RPC is unavailable (missing service key or an unapplied migration),
    // degrade gracefully to the in-memory limiter instead of failing the whole login.
    // The Supabase path resumes automatically once it's provisioned.
    let allowed = false;
    let resetTime: string | undefined;
    try {
      const admin = createSupabaseAdmin();
      const { data: limit, error: limitError } = await admin.rpc('check_admin_login_rate_limit', {
        p_key_hash: keyHash,
        p_limit: 5,
        p_window_seconds: 15 * 60,
      });
      if (limitError) throw new Error(`Admin rate limit unavailable: ${limitError.message}`);
      const rateLimitResult = limit as { allowed?: boolean; reset_at?: string } | null;
      allowed = !!rateLimitResult?.allowed;
      resetTime = rateLimitResult?.reset_at;
    } catch (rateLimitError) {
      console.error('[admin-login] Supabase rate limit unavailable, using in-memory fallback:', rateLimitError);
      const fallback = rateLimit(clientIP, { limit: 5, window: 15 * 60 * 1000, key: 'admin-login' });
      allowed = fallback.success;
      resetTime = new Date(fallback.resetTime).toISOString();
    }

    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Too many login attempts. Please try again later.',
          resetTime
        },
        { status: 429 }
      );
    }

    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    const isValid = await authenticateAdmin(password);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Create session
    await createSession();

    return NextResponse.json({
      success: true,
      message: 'Logged in successfully'
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_ORIGIN') {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
