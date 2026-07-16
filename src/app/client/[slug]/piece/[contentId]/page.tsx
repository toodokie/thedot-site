import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import DecideForm from './DecideForm'

const MUTED = '#68665f'

export default async function Piece({ params }: { params: Promise<{ slug: string; contentId: string }> }) {
  const { slug, contentId } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const item = await getContentItem(session.clientId, contentId)
  if (!item) redirect(`/client/${slug}`)

  const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '40px 32px', fontFamily: "'futura-pt', Arial, sans-serif", color: 'var(--foreground)' }
  return (
    <main style={{ background: 'var(--background)', minHeight: '100vh' }}>
      <div style={wrap}>
        <a href={`/client/${slug}`} style={{ color: MUTED, fontSize: 14 }}>← Back</a>
        <h1 style={{ fontWeight: 400, fontSize: 28, margin: '12px 0 6px' }}>{item.title}</h1>
        <div style={{ color: MUTED, fontSize: 13, marginBottom: 20 }}>
          {(item.platforms || []).join(' · ')} · v{item.version}{item.fact_check ? ` · ${item.fact_check}` : ''}
        </div>
        {item.canva_url && /^https:\/\//i.test(item.canva_url) && <a href={item.canva_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginBottom: 20 }}>Open the design in Canva →</a>}
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, marginBottom: 28 }}>{item.client_body}</p>
        {item.state === 'needs_review'
          ? <DecideForm slug={slug} contentId={item.content_id} />
          : <p style={{ color: MUTED }}>This piece is {item.state === 'with_dot' ? 'back with The Dot' : item.state}.</p>}
      </div>
    </main>
  )
}
