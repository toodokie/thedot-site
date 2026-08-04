import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getRecommendations, type RecommendationCategory } from '@/lib/portal/recommendations'
import { Eyebrow, Heading, Text, Button } from '@thedot/design-system'
import RecommendationCard from './RecommendationCard'
import styles from './strategy.module.css'

// Quiet, human-readable label per category. 'copy' reads as "Copywriting" (the client word for it).
const CATEGORY_LABEL: Record<RecommendationCategory, string> = {
  content: 'Content',
  platform: 'Platform',
  growth: 'Growth',
  copy: 'Copywriting',
}

// Display label for the optional platform tag. Known handles get their proper casing; anything else
// falls back to the stored value as-is. Null/empty means no platform badge is shown.
const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  website: 'Website',
  linkedin: 'LinkedIn',
  all: 'All',
}

function platformLabel(platform: string | null): string | null {
  if (!platform) return null
  const trimmed = platform.trim()
  if (!trimmed) return null
  return PLATFORM_LABEL[trimmed.toLowerCase()] ?? trimmed
}

export default async function Strategy({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  const recommendations = await getRecommendations(session.clientId)

  return (
    <div className={styles.wrap}>
      <div className={styles.back}>
        <Button as="a" href={`/client/${encodeURIComponent(slug)}`} variant="ghost" size="sm">Back</Button>
      </div>

      <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset · Strategy</Eyebrow></div>
      <div className={styles.heading}><Heading level={2}>Recommendations</Heading></div>
      <div className={styles.intro}>
        <Text size="lg" tone="graphite">Where we think the account should go next. Read, keep, or copy any of these into your notes.</Text>
      </div>

      {recommendations.length === 0 ? (
        <div className={styles.emptyCard}>
          <Text size="md" tone="graphite">No recommendations yet.</Text>
        </div>
      ) : (
        recommendations.map((r) => (
          <RecommendationCard
            key={r.id}
            categoryLabel={CATEGORY_LABEL[r.category] ?? r.category}
            platformLabel={platformLabel(r.platform)}
            title={r.title}
            body={r.body}
          />
        ))
      )}
    </div>
  )
}
