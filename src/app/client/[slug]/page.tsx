import Link from 'next/link'
import { getClientSession } from '@/lib/portal/auth'
import { redirect } from 'next/navigation'
import { getContent, getActivity } from '@/lib/portal/data'
import styles from './overview.module.css'

// Portal muted text: >5:1 on white and on the portal background (AA for small text), unlike --dim-grey.
const MUTED = '#68665f'

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  const [items, activity] = await Promise.all([getContent(session.clientId), getActivity(session.clientId)])
  const needs = items.filter((i) => i.state === 'needs_review')
  const withDot = items.filter((i) => i.state === 'with_dot')

  return (
    <main style={{ background: 'var(--background)', minHeight: '100vh' }}>
      <div className={styles.wrap}>
        <p style={{ letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 11, color: MUTED }}>Kanset · workspace</p>
        <h1 style={{ fontWeight: 300, fontSize: 'clamp(2.2rem,5vw,3.2rem)', margin: '8px 0 4px' }}>
          Good day{session.name ? `, ${session.name.split(' ')[0]}` : ''}.
        </h1>
        <p style={{ color: MUTED, fontSize: 18, marginBottom: 36 }}>
          <b style={{ color: 'var(--foreground)', fontWeight: 500 }}>{needs.length}</b> waiting for you.
        </p>
        <section className={styles.grid}>
          <div>
            <h2 style={{ fontWeight: 300, fontSize: 24, margin: '0 0 16px' }}>Needs your approval</h2>
            {needs.length === 0 && <p style={{ color: MUTED }}>Nothing right now.</p>}
            {needs.map((it) => {
              const meta = [(it.platforms || []).join(' · '), it.fact_check].filter(Boolean).join(' · ')
              return (
                <Link key={it.id} href={`/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(it.content_id)}`}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit', border: '1px solid #e8e5db', borderRadius: 10, padding: 18, marginBottom: 14, background: '#fff' }}>
                  <div style={{ fontWeight: 400, fontSize: 18 }}>{it.title}</div>
                  {meta && <div style={{ color: MUTED, fontSize: 13, marginTop: 6 }}>{meta}</div>}
                </Link>
              )
            })}
            {withDot.length > 0 && (
              <>
                <h3 style={{ fontWeight: 300, fontSize: 18, margin: '24px 0 12px', color: MUTED }}>Back with The Dot</h3>
                {withDot.map((it) => (
                  <div key={it.id} style={{ border: '1px dashed #dcd8cc', borderRadius: 10, padding: 14, marginBottom: 10, color: MUTED }}>
                    {it.title} <span style={{ fontSize: 13 }}>(we are revising this)</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <aside>
            <h2 style={{ fontWeight: 300, fontSize: 24, margin: '0 0 16px' }}>Activity</h2>
            <div style={{ border: '1px solid #e8e5db', borderRadius: 10, padding: 20, background: '#fff' }}>
              {activity.length === 0 ? (
                <p style={{ color: MUTED, fontSize: 14 }}>No activity yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {activity.map((a) => (
                    <li key={a.id} style={{ padding: '10px 0', borderTop: '1px solid #eee', fontSize: 14 }}>
                      <div><b style={{ fontWeight: 500 }}>{a.actor_name}</b> · {a.title}</div>
                      {a.summary && <div style={{ color: MUTED }}>{a.summary}</div>}
                      <time dateTime={a.created_at} style={{ color: MUTED, fontSize: 12 }}>{a.created_at.slice(0, 10)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </section>
        <form action="/client/logout" method="post" style={{ marginTop: 32 }}>
          <button type="submit" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: '10px 4px' }}>Sign out</button>
        </form>
      </div>
    </main>
  )
}
