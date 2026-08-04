import type { RetrievedChunk } from './assistant'

const KANSET_JULY_2026_REPORT: RetrievedChunk = {
  // Assistant run telemetry stores retrieved and cited chunk IDs in uuid[] columns.
  // Synthetic featured context therefore needs the same UUID shape as database chunks.
  chunk_id: 'c4aa28f7-4efb-4e54-88ee-7f55107d521a',
  document_id: 'c4aa28f7-4efb-4e54-88ee-7f55107d521a',
  source_type: 'report',
  title: 'July 2026 performance report',
  related_route: 'reports/july-2026',
  answer_eligibility: 'grounded_answer',
  excerpt: [
    'July 2026 report, published August 4.',
    'Social: views 139 to 12,811 (92 times); interactions 3 to 570; 20 pieces; net audience growth 36.',
    'Website: visits 351 to 499 (+42%); social visits 3 to 19; contact-page views 99 to 140; forms 6 to 11; all button clicks 26 to 38.',
    'July views: Instagram 5,004; Facebook 6,059; YouTube 1,748.',
    'Findings: on-camera video led; viewers gave clips about six seconds; Shorts drive discovery and long-form drives depth.',
    'Limit: a measurement path, not a tracked conversion funnel. Totals may overlap. June social is a baseline floor.',
    'Actions: tighter filmed cuts, selective carousels, and a required source field for booked consultations.',
  ].join(' '),
  rank: 2000,
}

export function getFeaturedReportChunk(clientSlug: string): RetrievedChunk | null {
  if (clientSlug !== 'kanset') return null
  return KANSET_JULY_2026_REPORT
}
