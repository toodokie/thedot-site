import { NextRequest } from 'next/server';
import { randomBytes, createHash } from 'crypto';

interface CSRFSession {
  token: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory store for CSRF tokens (consider Redis for production scaling)
const csrfStore = new Map<string, CSRFSession>();

// Token expires after 1 hour
const TOKEN_EXPIRY = 60 * 60 * 1000;

/**
 * Generate a CSRF token for a session
 * @param sessionId - Unique session identifier (can be IP + User-Agent hash)
 * @returns CSRF token
 */
export function generateCSRFToken(sessionId: string): string {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  
  csrfStore.set(sessionId, {
    token,
    createdAt: now,
    expiresAt: now + TOKEN_EXPIRY
  });
  
  return token;
}

/**
 * Validate CSRF token
 * @param sessionId - Session identifier
 * @param token - Token to validate
 * @returns true if valid
 */
export function validateCSRFToken(sessionId: string, token: string): boolean {
  const session = csrfStore.get(sessionId);
  
  if (!session) {
    return false;
  }
  
  const now = Date.now();
  
  // Check if token expired
  if (now > session.expiresAt) {
    csrfStore.delete(sessionId);
    return false;
  }
  
  return session.token === token;
}

/**
 * Generate session ID from request
 * @param request - Next.js request object
 * @returns Session ID
 */
export function generateSessionId(request: NextRequest): string {
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Create a hash from IP + User-Agent for session identification
  return createHash('sha256')
    .update(ip + userAgent)
    .digest('hex');
}

/**
 * Get client IP address from request headers
 * @param request - Next.js request object
 * @returns IP address string
 */
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  return request.ip || 'unknown';
}

/**
 * Clean up expired CSRF tokens
 */
export function cleanupCSRFStore(): void {
  const now = Date.now();
  
  for (const [sessionId, session] of csrfStore.entries()) {
    if (now > session.expiresAt) {
      csrfStore.delete(sessionId);
    }
  }
}

// Cleanup every 30 minutes
setInterval(cleanupCSRFStore, 30 * 60 * 1000);