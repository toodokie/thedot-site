import { Text } from '@thedot/design-system'
import type { ClientProposal } from '@/lib/portal/proposals'
import styles from './requests.module.css'

export default function ProposalDocument({ proposal }: { proposal: ClientProposal }) {
  return <div className={styles.proposalDocument}>
    {proposal.blocks.map((block, index) => <section key={`${block.kind}-${index}`} className={`${styles.proposalBlock} ${styles[`proposal_${block.kind}`] ?? ''}`}>
      {block.title && <h2>{block.title}</h2>}
      {block.body && <Text as="p" tone="graphite">{block.body}</Text>}
      {block.items && <ul>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>}
      {block.links && <ul className={styles.proposalLinks}>{block.links.map((link) => <li key={link.url}><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a></li>)}</ul>}
    </section>)}
  </div>
}
