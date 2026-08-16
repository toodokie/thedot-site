import { jwtVerify } from 'jose/jwt/verify'
import type { NextRequest } from 'next/server'

const ADMIN_ISSUER = 'thedot-site'
const ADMIN_AUDIENCE = 'thedot-admin'

export async function hasValidAdminMiddlewareSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('session')?.value
  const secret = process.env.ADMIN_JWT_SECRET
  if (!token || !secret || secret.length < 32) return false

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      issuer: ADMIN_ISSUER,
      audience: ADMIN_AUDIENCE,
      subject: 'admin',
    })
    return payload.role === 'admin' && payload.sub === 'admin' && typeof payload.exp === 'number'
  } catch {
    return false
  }
}
