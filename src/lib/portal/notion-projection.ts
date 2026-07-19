// Pure, DB-free logic for the Notion projection consumer. Kept separate so it is unit-testable
// without a database. The SQL side (0016) owns claiming/fencing; this owns the per-row decision and
// backoff, and must stay in lockstep with the SQL helpers it mirrors.

export const PROJECTION_OBJECT_TYPES = ['content', 'report', 'recommendation', 'link', 'communication'] as const
export type ProjectionObjectType = (typeof PROJECTION_OBJECT_TYPES)[number]

export type ProjectionOperation = 'upsert' | 'archive' | 'reconcile'
export type ProjectionDecision = 'apply' | 'archive' | 'skip_stale'

// Exponential backoff capped at 1h, mirroring mark_projection_failed's SQL helper so the two never
// drift. `attempts` is the post-increment value (>= 1 after the first claim).
export function nextBackoffSeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** attempts)
}

// Decide what to do with a claimed outbox row:
// - reconcile forces a re-project even if the revision already succeeded (drift repair);
// - a stale revision (a >= revision already succeeded for this key) is skipped so projecting it can
//   never regress Notion to an older state;
// - archive deletes in Notion; everything else is a normal upsert.
export function decideProjection(row: {
  operation: ProjectionOperation
  objectRevision: number
  lastSucceededRevision: number | null
}): ProjectionDecision {
  if (row.operation === 'reconcile') return 'apply'
  if (row.lastSucceededRevision !== null && row.lastSucceededRevision >= row.objectRevision) {
    return 'skip_stale'
  }
  if (row.operation === 'archive') return 'archive'
  return 'apply'
}

// Map an object_type to its projector key, or throw. An unknown type must fail loud, never be
// silently dropped (a dropped row would strand in the outbox with no signal).
export function routeObjectType(objectType: string): ProjectionObjectType {
  if ((PROJECTION_OBJECT_TYPES as readonly string[]).includes(objectType)) {
    return objectType as ProjectionObjectType
  }
  throw new Error(`unknown projection object_type: ${objectType}`)
}
