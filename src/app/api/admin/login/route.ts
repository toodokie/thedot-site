import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, createSession } from '@/lib/auth';
import { rateLimit, getClientIP } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting - 5 attempts per 15 minutes
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, {
      limit: 5,
      window: 15 * 60 * 1000,
      key: 'admin-login'
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Too many login attempts. Please try again later.',
          resetTime: rateLimitResult.resetTime
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
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
