import type { ProjectionObjectType } from './notion-projection'

// A projector maps one object_type to a Notion database plus the client-safe fields that may be
// projected (the projection-surface PII wall: only these fields ever leave Supabase for Notion).
//
// `wired` is false until the object's Supabase client-safe view columns AND the target Notion DB
// property schema are BOTH confirmed. We deliberately do not guess either: a wrong column name is
// exactly the class of bug that broke prod (`content_with_state.planned_date does not exist`). The
// consumer holds an unwired row rather than write a guessed mapping, and the fail-closed
// notion_projection switch keeps the whole plane dark until launch, so nothing drains prematurely.
export type ProjectorSpec = {
  objectType: ProjectionObjectType
  notionDatabaseId: string | null   // known target DB, or null where no Notion surface exists yet
  safeFields: string[]              // the ONLY loaded fields a future mapping may project
  wired: boolean
}

export const PROJECTORS: Record<ProjectionObjectType, ProjectorSpec> = {
  content: {
    objectType: 'content',
    notionDatabaseId: '27464dca-49b9-4404-bec5-fe4f67390154', // Kanset Content Calendar
    safeFields: ['title', 'planned_date', 'status', 'platforms'],
    wired: false,
  },
  report: {
    objectType: 'report',
    notionDatabaseId: '7acb4709e3da4b0a9069dcc28b31f5c2', // Kanset SM Metrics
    safeFields: ['period_start', 'period_end', 'platform', 'metrics', 'summary'],
    wired: false,
  },
  recommendation: {
    objectType: 'recommendation',
    notionDatabaseId: null,
    safeFields: ['title', 'body', 'category', 'platform'],
    wired: false,
  },
  link: {
    objectType: 'link',
    notionDatabaseId: null,
    safeFields: ['label', 'url', 'category', 'description'],
    wired: false,
  },
  communication: {
    objectType: 'communication',
    notionDatabaseId: null,
    safeFields: ['title', 'summary', 'occurred_at', 'channel'],
    wired: false,
  },
}

export function getProjector(objectType: ProjectionObjectType): ProjectorSpec {
  return PROJECTORS[objectType]
}
