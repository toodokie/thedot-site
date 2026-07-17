import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import type { CSSProperties } from 'react'
import Image from 'next/image'
import { Heading, Text, Button } from '@thedot/design-system'
import DecideForm from './DecideForm'

const chip: CSSProperties = {
  fontFamily: 'var(--dot-font-text)', fontSize: 11, color: 'var(--dot-graphite)',
  border: '1px solid var(--dot-hairline)', background: 'transparent', padding: '2px 8px',
  textTransform: 'capitalize', letterSpacing: '0.01em', lineHeight: 1.5,
}
const chipFact: CSSProperties = {
  ...chip, color: 'var(--dot-black)', background: 'var(--dot-yellow-pale)', borderColor: 'transparent',
}

export default async function Piece({ params }: { params: Promise<{ slug: string; contentId: string }> }) {
  const { slug, contentId } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const item = await getContentItem(session.clientId, contentId)
  if (!item) redirect(`/client/${slug}`)

  return (
    <main style={{ background: 'var(--dot-cream)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 32px' }}>
        <Image src="/images/logo.png" alt="The Dot Creative" width={64} height={40} priority style={{ display: 'block', marginBottom: 28 }} />
        <Button as="a" href={`/client/${slug}`} variant="ghost" size="sm">Back</Button>

        <div style={{ marginTop: 24, marginBottom: 14 }}>
          <Heading level={3}>{item.title}</Heading>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
          {(item.platforms || []).map((p) => <span key={p} style={chip}>{p}</span>)}
          <span style={chip}>v{item.version}</span>
          {item.fact_check && <span style={chipFact}>{item.fact_check}</span>}
        </div>

        {item.canva_url && /^https:\/\//i.test(item.canva_url) && (
          <div style={{ marginBottom: 24 }}>
            <Button as="a" href={item.canva_url} target="_blank" rel="noreferrer" variant="yellow" size="sm">
              Open the design in Canva →
            </Button>
          </div>
        )}

        {/* white-space is inherited, so pre-wrap on the wrapper reaches the Text paragraph. */}
        <div style={{ whiteSpace: 'pre-wrap', marginBottom: 28 }}>
          <Text size="md" tone="black">{item.client_body}</Text>
        </div>

        {item.state === 'needs_review'
          ? <DecideForm slug={slug} contentId={item.content_id} />
          : <Text tone="grey">This piece is {item.state === 'with_dot' ? 'back with The Dot' : item.state}.</Text>}
      </div>
    </main>
  )
}
