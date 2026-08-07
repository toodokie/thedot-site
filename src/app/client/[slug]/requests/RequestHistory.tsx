import Link from 'next/link'
import { Text } from '@thedot/design-system'
import type { ContentRow } from '@/lib/portal/data'
import { clientRequestLabel, type ContentRequestMessage, type ContentRequestRow } from '@/lib/portal/requests'
import RequestConversation from './RequestConversation'
import styles from './requests.module.css'

function stringValue(payload: Record<string, unknown>, key: string): string | null {
  return typeof payload[key] === 'string' ? payload[key] as string : null
}

function displayBlockLabel(blockKey: string | null, storedLabel?: string): string | null {
  if (!blockKey) return null
  if (blockKey === 'reel-script') return 'Reel design copy (on-screen text)'
  if (blockKey === 'ig-facebook-caption') return 'Post caption (Instagram + Facebook)'
  return storedLabel ?? blockKey.replaceAll('-', ' ')
}

export default function RequestHistory({ slug, requests, messages, content, canReply }: {
  slug: string; requests: ContentRequestRow[]; messages: ContentRequestMessage[]; content: ContentRow[]; canReply: boolean
}) {
  const byUuid = new Map(content.map((item) => [item.id, item]))
  if (!requests.length) return <Text tone="grey">No content requests yet.</Text>
  return <div className={styles.history}>
    {requests.map((request) => {
      const item = request.content_id ? byUuid.get(request.content_id) : null
      const title = request.request_type === 'create'
        ? stringValue(request.payload, 'title') ?? 'New piece'
        : item?.title ?? 'Content request'
      const proposed = request.request_type === 'edit'
        ? stringValue(request.payload, 'proposed_text') : null
      const blockKey = request.request_type === 'edit'
        ? stringValue(request.payload, 'block_key') : null
      const copyBlock = blockKey ? item?.copy_blocks.find((block) => block.key === blockKey) : null
      const currentBlock = copyBlock?.body ?? null
      const blockLabel = displayBlockLabel(blockKey, copyBlock?.label)
      const original = request.base_copy_text
        ?? (request.base_version === item?.version ? currentBlock : null)
      const brief = request.request_type === 'create' ? stringValue(request.payload, 'brief') : null
      const reason = request.request_type === 'archive' ? stringValue(request.payload, 'reason') : null
      const conversation = messages.filter((message) => message.request_id === request.id)
      return <article className={styles.card} key={request.id}>
        <div className={styles.cardHead}>
          <div>
            <Text as="div" tone="black"><strong>{title}</strong></Text>
            <Text as="div" size="sm" tone="grey">{request.request_type === 'archive' ? 'Removal request' : request.request_type === 'edit' ? `Copy change requested by ${request.requester_name}` : 'New piece'}</Text>
          </div>
          <span className={styles.badge} data-status={request.status}>{clientRequestLabel(request.status)}</span>
        </div>
        {blockLabel && <div className={styles.editedArea}>
          <span className={styles.editedAreaLabel}>Edited area</span>
          <strong>{blockLabel}</strong>
        </div>}
        {(original || proposed) && <div className={styles.versionComparison} aria-label="Requested copy comparison">
          {original && <section className={`${styles.versionPanel} ${styles.versionBefore}`}>
            <div className={styles.versionPanelHead}>
              <div>
                <span className={styles.versionKicker}>Before</span>
                <strong>Released copy</strong>
              </div>
              {request.base_version && <span className={styles.versionNumber}>Version {request.base_version}</span>}
            </div>
            <div className={styles.versionCopy}>{original}</div>
          </section>}
          {original && proposed && <div className={styles.versionConnector} aria-hidden="true">↓</div>}
          {proposed && <section className={`${styles.versionPanel} ${styles.versionRequested}`}>
            <div className={styles.versionPanelHead}>
              <div>
                <span className={styles.versionKicker}>Maria&apos;s request</span>
                <strong>Requested copy</strong>
              </div>
              {request.canonical_version
                ? <span className={styles.versionNumber}>Applied as v{request.canonical_version}</span>
                : request.base_version && <span className={styles.versionNumber}>From v{request.base_version}</span>}
            </div>
            <div className={styles.versionCopy}>{proposed}</div>
          </section>}
        </div>}
        {brief && <div className={styles.copy}><Text as="div" size="sm">{brief}</Text></div>}
        {reason && <div className={styles.copy}><Text as="div" size="sm">{reason}</Text></div>}
        {request.resolution_note && <div className={styles.resolution}>
          <strong>{request.status === 'applied' ? 'Change applied' : 'Update'}</strong>
          <span>{request.resolution_note}</span>
        </div>}
        {request.status === 'applied' && request.canonical_content_key &&
          <p className={styles.resultLink}><Link href={`/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(request.canonical_content_key)}`}>
            Open released version{request.canonical_version ? ` ${request.canonical_version}` : ''}
          </Link></p>}
        <RequestConversation slug={slug} requestId={request.id} messages={conversation}
          canReply={canReply && ['pending', 'answered'].includes(request.status)} />
        <div className={styles.meta}>
          Submitted by {request.requester_name} · <time dateTime={request.created_at}>{request.created_at.slice(0, 10)}</time>
          {request.base_version ? ` · based on v${request.base_version}` : ''}
        </div>
      </article>
    })}
  </div>
}
