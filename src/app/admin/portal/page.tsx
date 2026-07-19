import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifySession } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import PublicationAdmin, { type AdminTarget } from './PublicationAdmin'

export const dynamic = 'force-dynamic'

export default async function PortalAdminPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const admin = createSupabaseAdmin()
  const [clients, content, schedules, publications, observations, actors] = await Promise.all([
    admin.from('clients').select('id,name,slug').order('name'),
    admin.from('content_with_state').select('id,client_id,content_id,title,version').order('planned_date'),
    admin.from('content_schedule_targets').select('id,client_id,content_id,content_version,destination,status,scheduled_at,evidence_id,verifier_actor_id'),
    admin.from('content_publication_targets_client').select('id,client_id,content_id,content_version,destination,status,live_url,published_at,verification_label'),
    admin.from('content_publication_observations').select('id,client_id,publication_target_id,provider_state,published_at,observed_at,source_type,reconciliation_status,evidence_id,permalink,verifier_actor_id').order('created_at', { ascending: false }),
    admin.from('agency_actors').select('id,display_name'),
  ])
  const failure = clients.error ?? content.error ?? schedules.error ?? publications.error ?? observations.error ?? actors.error
  if (failure) throw new Error(`Portal admin data unavailable: ${failure.message}`)
  const clientMap = new Map((clients.data ?? []).map((client) => [client.id, client]))
  const contentMap = new Map((content.data ?? []).map((item) => [`${item.client_id}:${item.id}:${item.version}`, item]))
  const scheduleMap = new Map((schedules.data ?? []).map((target) => [
    `${target.client_id}:${target.content_id}:${target.content_version}:${target.destination}`, target,
  ]))
  const actorMap = new Map((actors.data ?? []).map((actor) => [actor.id, actor.display_name]))
  const targets: AdminTarget[] = (publications.data ?? []).flatMap((publication) => {
    const item = contentMap.get(`${publication.client_id}:${publication.content_id}:${publication.content_version}`)
    const client = clientMap.get(publication.client_id)
    if (!item || !client) return []
    const schedule = scheduleMap.get(`${publication.client_id}:${publication.content_id}:${publication.content_version}:${publication.destination}`)
    return [{
      clientId: publication.client_id, clientName: client.name, contentId: item.content_id,
      title: item.title, version: publication.content_version, destination: publication.destination,
      scheduleTargetId: schedule?.id ?? null, scheduleStatus: schedule?.status ?? 'not created',
      scheduledAt: schedule?.scheduled_at ?? null, scheduleEvidenceId: schedule?.evidence_id ?? null,
      scheduleVerifier: schedule?.verifier_actor_id ? actorMap.get(schedule.verifier_actor_id) ?? 'Unknown' : null,
      publicationTargetId: publication.id,
      publicationStatus: publication.status, publicationLabel: publication.verification_label,
      liveUrl: publication.live_url, publishedAt: publication.published_at,
      history: (observations.data ?? []).filter((observation) =>
        observation.client_id === publication.client_id
          && observation.publication_target_id === publication.id,
      ).map((observation) => ({
        id: observation.id, providerState: observation.provider_state,
        publishedAt: observation.published_at, observedAt: observation.observed_at,
        sourceType: observation.source_type, reconciliationStatus: observation.reconciliation_status,
        evidenceId: observation.evidence_id, permalink: observation.permalink,
        verifier: actorMap.get(observation.verifier_actor_id) ?? 'Unknown',
      })),
    }]
  })
  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px' }}>
      <p><Link href="/admin/dashboard">Back to dashboard</Link></p>
      <h1>Portal publication coordination</h1>
      <p style={{ maxWidth: 760, color: '#555' }}>
        Provider truth is recorded per destination. A planned time is never proof of scheduling or publication.
        Every operation below requires immutable evidence and preserves corrections as new observations.
      </p>
      <PublicationAdmin targets={targets} />
    </main>
  )
}
