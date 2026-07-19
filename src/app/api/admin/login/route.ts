import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, createSession } from '@/lib/auth';
import { createHash } from 'node:crypto';
import { assertSameOriginRequest } from '@/lib/admin-security';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request);
    const clientIP = (request.headers.get('x-forwarded-for')?.split(',')[0]
      ?? request.headers.get('x-real-ip') ?? 'unknown').trim();
    const keyHash = createHash('sha256').update(`admin-login:${clientIP}`).digest('hex');
    const admin = createSupabaseAdmin();
    const { data: limit, error: limitError } = await admin.rpc('check_admin_login_rate_limit', {
      p_key_hash: keyHash,
      p_limit: 5,
      p_window_seconds: 15 * 60,
    });
    if (limitError) throw new Error(`Admin rate limit unavailable: ${limitError.message}`);
    const rateLimitResult = limit as { allowed?: boolean; reset_at?: string } | null;

    if (!rateLimitResult?.allowed) {
      return NextResponse.json(
        {
          error: 'Too many login attempts. Please try again later.',
          resetTime: rateLimitResult?.reset_at
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
