import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getLinks, type LinkRow } from '@/lib/portal/links'
import { Eyebrow, Heading, Text, Arrow } from '@thedot/design-system'
import styles from './library.module.css'

// One editorial link card: label, optional description, an external-link affordance (the arrow).
// Every link opens in a new tab (target + noopener noreferrer). Renders inside the portal shell.
function LinkCard({ link }: { link: LinkRow }) {
  return (
    <a className={styles.card} href={link.url} target="_blank" rel="noopener noreferrer">
      <span className={styles.cardBody}>
        <Text as="span" size="md" tone="black" className={styles.cardLabel}>{link.label}</Text>
        {link.description && (
          <Text as="span" size="sm" tone="graphite" className={styles.cardDesc}>{link.description}</Text>
        )}
      </span>
      <span className={styles.cardArrow} aria-hidden>
        <Arrow direction="right" size={18} />
      </span>
    </a>
  )
}

// One Library section (Brand or Video): an eyebrow heading over a grid of link cards,
// with its own empty state when nothing is shared yet.
function Section({ label, links, emptyText }: { label: string; links: LinkRow[]; emptyText: string }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}><Eyebrow tone="grey">{label}</Eyebrow></div>
      {links.length === 0 ? (
        <div className={styles.empty}><Text size="md" tone="graphite">{emptyText}</Text></div>
      ) : (
        <div className={styles.grid}>
          {links.map((link) => <LinkCard key={link.id} link={link} />)}
        </div>
      )}
    </section>
  )
}

export default async function Library({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  const links = await getLinks(session.clientId)
  const brand = links.filter((l) => l.category === 'brand')
  const video = links.filter((l) => l.category === 'video')
  const posting = links.filter((l) => l.category === 'posting')

  return (
    <div className={styles.wrap}>
      <div className={styles.kicker}><Eyebrow tone="grey">Kanset · Library</Eyebrow></div>
      <div className={styles.title}><Heading level={2}>Library</Heading></div>
      <Text size="lg" tone="graphite" className={styles.intro}>
        Brand, video, and posting links, in one place. Everything opens in a new tab.
      </Text>

      <Section label="Brand" links={brand} emptyText="No brand links yet." />
      <Section label="Video" links={video} emptyText="No video links yet." />
      <Section label="Posting" links={posting} emptyText="No posting links yet." />
    </div>
  )
}
