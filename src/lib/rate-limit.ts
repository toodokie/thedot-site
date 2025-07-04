import { NextRequest } from 'next/server';

interface RateLimitConfig {
  limit?: number; // Max attempts
  window?: number; // Time window in milliseconds
}

interface AttemptRecord {
  attempts: number[];
  resetTime: number;
}

// In-memory store for rate limiting (consider Redis for production scaling)
const attemptStore = new Map<string, AttemptRecord>();

/**
 * Rate limiting utility to prevent spam and abuse
 * @param identifier - Unique identifier (usually IP address)
 * @param config - Rate limit configuration
 * @returns true if request is allowed, false if rate limited
 */
export function rateLimit(
  identifier: string, 
  config: RateLimitConfig = {}
): { success: boolean; remaining: number; resetTime: number } {
  const { limit = 5, window = 15 * 60 * 1000 } = config; // Default: 5 requests per 15 minutes
  const now = Date.now();
  
  // Get or create attempt record
  let record = attemptStore.get(identifier);
  
  if (!record || now > record.resetTime) {
    // Create new record or reset expired one
    record = {
      attempts: [],
      resetTime: now + window
    };
  }
  
  // Clean old attempts within the window
  record.attempts = record.attempts.filter(time => now - time < window);
  
  // Check if limit exceeded
  if (record.attempts.length >= limit) {
    attemptStore.set(identifier, record);
    return {
      success: false,
      remaining: 0,
      resetTime: record.resetTime
    };
  }
  
  // Add current attempt
  record.attempts.push(now);
  attemptStore.set(identifier, record);
  
  return {
    success: true,
    remaining: limit - record.attempts.length,
    resetTime: record.resetTime
  };
}

/**
 * Get client IP address from request headers
 * @param request - Next.js request object
 * @returns IP address string
 */
export function getClientIP(request: NextRequest): string {
  // Try various headers to get the real IP
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
  
  // Fallback to connection remote address
  return request.ip || 'unknown';
}

/**
 * Clean up old rate limit records (call periodically)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  
  for (const [key, record] of attemptStore.entries()) {
    if (now > record.resetTime && record.attempts.length === 0) {
      attemptStore.delete(key);
    }
  }
}

// Cleanup every hour
setInterval(cleanupRateLimitStore, 60 * 60 * 1000);