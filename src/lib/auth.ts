import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ADMIN_ISSUER = 'thedot-site';
const ADMIN_AUDIENCE = 'thedot-admin';

function secretKey(): Uint8Array {
  const value = process.env.ADMIN_JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('ADMIN_JWT_SECRET must be configured with at least 32 characters');
  }
  return new TextEncoder().encode(value);
}

export interface SessionPayload {
  userId: string;
  role: 'admin';
  expiresAt: Date;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string = 'admin') {
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

  const session = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ADMIN_ISSUER)
    .setAudience(ADMIN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/',
  });

  return session;
}

export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get('session')?.value;

  if (!cookie) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(cookie, secretKey(), {
      algorithms: ['HS256'],
      issuer: ADMIN_ISSUER,
      audience: ADMIN_AUDIENCE,
      subject: 'admin',
    });

    if (payload.role !== 'admin' || payload.sub !== 'admin' || typeof payload.exp !== 'number') {
      return null;
    }

    return {
      userId: payload.sub,
      role: 'admin',
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}

export async function authenticateAdmin(password: string): Promise<boolean> {

  if (!ADMIN_PASSWORD_HASH) {
    console.error('[AUTH] ADMIN_PASSWORD_HASH not set in environment variables');
    return false;
  }

  const result = await verifyPassword(password, ADMIN_PASSWORD_HASH);
  return result;
}
