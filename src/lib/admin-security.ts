import 'server-only'
import { headers } from 'next/headers'
import { verifySession } from '@/lib/auth'

export async function requireAdminSession() {
  const session = await verifySession()
  if (!session || session.role !== 'admin' || session.userId !== 'admin') {
    throw new Error('ADMIN_AUTH_REQUIRED')
  }
  return session
}

export function assertSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (!origin || !host || origin !== `${proto}://${host}`) throw new Error('INVALID_ORIGIN')
}

export async function assertSameOriginAction() {
  const requestHeaders = await headers()
  const origin = requestHeaders.get('origin')
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'https'
  if (!origin || !host || origin !== `${proto}://${host}`) throw new Error('INVALID_ORIGIN')
}
