import type { WorkspaceData } from './derive'

// The agency view of her page (plan 5): what she sees, with every way to act turned off. Its own
// module so the client workspace can import it without derive.ts's server-side imports.
export function readOnlyWorkspace(data: WorkspaceData): WorkspaceData {
  return {
    ...data, canEdit: false, canDecide: false, canComment: false, canSubmitRequests: false,
    canRequestSchedule: false, removal: null, showIntro: false, canPickOptions: false,
  }
}
