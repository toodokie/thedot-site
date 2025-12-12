// Shared in-memory security statistics
// In production, consider using Redis or a database

interface SecurityStats {
  botBlocks: number;
  rateLimitHits: number;
  lastReset: Date;
}

let stats: SecurityStats = {
  botBlocks: 0,
  rateLimitHits: 0,
  lastReset: new Date(),
};

// Reset stats daily
const resetInterval = 24 * 60 * 60 * 1000; // 24 hours

export function incrementBotBlocks() {
  checkReset();
  stats.botBlocks++;
}

export function incrementRateLimits() {
  checkReset();
  stats.rateLimitHits++;
}

export function getSecurityStats(): SecurityStats {
  checkReset();
  return { ...stats };
}

function checkReset() {
  const now = new Date();
  const timeSinceReset = now.getTime() - stats.lastReset.getTime();

  if (timeSinceReset > resetInterval) {
    stats = {
      botBlocks: 0,
      rateLimitHits: 0,
      lastReset: now,
    };
  }
}
