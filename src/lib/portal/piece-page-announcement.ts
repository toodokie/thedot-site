import { PIECE_PAGE_INTRO_KEY } from './review-flow-announcement'

// The one-time note about the new piece page (spec 9.2 and 9.5, decision 3: one dialog, not two).
// Plan 4a's first-visit intro (FirstVisitIntro.tsx) renders this copy under its existing key, so a
// seat that already acknowledged the intro never sees a second dialog. In-portal only, never
// emailed. Per seat, server-side receipt (portal_announcement_acknowledgments, 0081).
// COPY STATUS: draft. Must pass the kanset-copywriting skill before deploy (Task 18).
export const PIECE_PAGE_ANNOUNCEMENT_KEY = PIECE_PAGE_INTRO_KEY

export const PIECE_PAGE_ANNOUNCEMENT = {
  title: 'Your review page, rebuilt',
  lines: [
    'Watch the video and page through every frame right here. No Drive needed.',
    'Tap any text to edit it in place, on your phone or computer. I save your edits as you type.',
    'When you are done, send your edits or approve. One button at the bottom does either.',
    'Next time you visit, a small card will ask how the new page works for you. One tap is plenty.',
  ],
  signature: 'Anastasia',
  action: 'Got it',
} as const

export const FEEDBACK_CARD_COPY = {
  title: 'How is the new review page?',
  sub: 'One tap is plenty. It helps me fix what gets in your way.',
  ratingLegend: 'Rating, 1 to 5',
  commentLabel: 'Comment (optional)',
  close: 'Close',
  send: 'Send',
  thanks: 'Thank you. I read every answer.',
  failed: 'That did not send. Your answer is still here, so you can try again.',
} as const
