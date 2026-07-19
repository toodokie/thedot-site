import Link from 'next/link'
import { Text } from '@thedot/design-system'
import type { ContentRow } from '@/lib/portal/data'
import { clientRequestLabel, type ContentRequestRow } from '@/lib/portal/requests'
import styles from './requests.module.css'

function stringValue(payload: Record<string, unknown>, key: string): string | null {
  return typeof payload[key] === 'string' ? payload[key] as string : null
}

export default function RequestHistory({ slug, requests, content }: {
  slug: string; requests: ContentRequestRow[]; content: ContentRow[]
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
      const original = blockKey ? item?.copy_blocks.find((block) => block.key === blockKey)?.body : null
      const brief = request.request_type === 'create' ? stringValue(request.payload, 'brief') : null
      const reason = request.request_type === 'archive' ? stringValue(request.payload, 'reason') : null
      return <article className={styles.card} key={request.id}>
        <div className={styles.cardHead}>
          <div>
            <Text as="div" tone="black"><strong>{title}</strong></Text>
            <Text as="div" size="sm" tone="grey">{request.request_type === 'archive' ? 'Removal request' : request.request_type === 'edit' ? 'Copy edit' : 'New piece'}</Text>
          </div>
          <span className={styles.badge}>{clientRequestLabel(request.status)}</span>
        </div>
        {original && <div className={styles.copy}><Text as="div" size="sm" tone="grey">Current released copy</Text><Text as="div" size="sm">{original}</Text></div>}
        {proposed && <div className={styles.copy}><Text as="div" size="sm" tone="grey">Suggested copy</Text><Text as="div" size="sm">{proposed}</Text></div>}
        {brief && <div className={styles.copy}><Text as="div" size="sm">{brief}</Text></div>}
        {reason && <div className={styles.copy}><Text as="div" size="sm">{reason}</Text></div>}
        {request.resolution_note && <div className={styles.copy}><Text as="div" size="sm">{request.resolution_note}</Text></div>}
        {request.status === 'applied' && request.canonical_content_key &&
          <p><Link href={`/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(request.canonical_content_key)}`}>Open the resulting piece</Link></p>}
        <div className={styles.meta}>
          Submitted by {request.requester_name} · <time dateTime={request.created_at}>{request.created_at.slice(0, 10)}</time>
          {request.base_version ? ` · based on v${request.base_version}` : ''}
        </div>
      </article>
    })}
  </div>
}
