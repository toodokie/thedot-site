import { DRAFT_STATUS_TEXT, type DraftSyncState } from '@/lib/portal/review-drafts-core'

// Plan 3's status wording, with the offline line naming the device (Anastasia's decision 6 in
// plan 3: "this phone" on a phone, "this device" elsewhere).
export function draftStatusLine(state: DraftSyncState, isPhone: boolean): string | null {
  if (state === 'idle') return null
  if (state === 'offline') return `Saved on this ${isPhone ? 'phone' : 'device'} · will sync when online`
  return DRAFT_STATUS_TEXT[state]
}
