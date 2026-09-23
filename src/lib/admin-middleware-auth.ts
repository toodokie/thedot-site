import { jwtVerify } from 'jose/jwt/verify'
import { SignJWT } from 'jose/jwt/sign'
import type { NextRequest } from 'next/server'

const ADMIN_ISSUER = 'thedot-site'
const ADMIN_AUDIENCE = 'thedot-admin'

export const ADMIN_SESSION_HOURS = 12
// Re-issue once a session is past halfway. An operator who is working never gets thrown out
// mid-task; one who walks away still expires on the same 12-hour clock from their last request.
const REFRESH_AFTER_FRACTION = 0.5

export type AdminSessionCheck =
  // No cookie at all: a genuine sign-in, or a cookie the browser declined to send.
  | { state: 'absent' }
  // A real session that has run out. This is the case worth naming on screen.
  | { state: 'expired' }
  // Present but unusable: wrong signature, wrong audience, tampered.
  | { state: 'invalid' }
  | { state: 'valid'; expiresAt: number; shouldRefresh: boolean }

export async function checkAdminMiddlewareSession(request: NextRequest): Promise<AdminSessionCheck> {
  const token = request.cookies.get('session')?.value
  const secret = process.env.ADMIN_JWT_SECRET
  if (!token) return { state: 'absent' }
  if (!secret || secret.length < 32) return { state: 'invalid' }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      issuer: ADMIN_ISSUER,
      audience: ADMIN_AUDIENCE,
      subject: 'admin',
    })
    if (payload.role !== 'admin' || payload.sub !== 'admin'
        || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      return { state: 'invalid' }
    }
    const lifetime = payload.exp - payload.iat
    const elapsed = Math.floor(Date.now() / 1000) - payload.iat
    return {
      state: 'valid',
      expiresAt: payload.exp * 1000,
      shouldRefresh: lifetime > 0 && elapsed > lifetime * REFRESH_AFTER_FRACTION,
    }
  } catch (error) {
    // jose reports an expired token distinctly, and the difference is the whole point: "your
    // session ran out" is a sentence we can show, "not signed in" is not.
    const code = (error as { code?: string } | null)?.code
    return { state: code === 'ERR_JWT_EXPIRED' ? 'expired' : 'invalid' }
  }
}

export async function mintAdminSession(): Promise<string | null> {
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret || secret.length < 32) return null
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin')
    .setIssuer(ADMIN_ISSUER)
    .setAudience(ADMIN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_HOURS}h`)
    .sign(new TextEncoder().encode(secret))
}

export async function hasValidAdminMiddlewareSession(request: NextRequest): Promise<boolean> {
  return (await checkAdminMiddlewareSession(request)).state === 'valid'
}
