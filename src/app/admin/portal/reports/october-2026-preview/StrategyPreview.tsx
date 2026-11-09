import { Eyebrow, Heading, Text, Button } from '@thedot/design-system'
import styles from '@/app/client/[slug]/strategy/strategy.module.css'
import { octoberStrategy } from './strategy-draft'

export default function StrategyPreview({ backHref }: { backHref: string }) {
  return <div className={styles.wrap}>
    <div className={styles.back}><Button as="a" href={backHref} variant="ghost" size="sm">Back</Button></div>
    <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset · Strategy</Eyebrow></div>
    <div className={styles.heading}><Heading level={2}>Recommendations</Heading></div>
    <div className={styles.intro}><Text size="lg" tone="graphite">Where we think the account should go next. Read, keep, or copy any of these into your notes.</Text></div>
    {octoberStrategy.map(card => <article className={styles.card} key={card.id}>
      <div className={styles.cardHead}><div className={styles.chips}>
        <span className={styles.chip}>{card.categoryLabel}</span>
        {card.platformLabel && <span className={styles.chip}>{card.platformLabel}</span>}
      </div></div>
      <Heading level={4} className={styles.title}>{card.title}</Heading>
      <div className={styles.body}><Text size="md" tone="black">{card.body}</Text></div>
    </article>)}
  </div>
}
