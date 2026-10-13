import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'

export type ProposalBlockKind = 'heading' | 'paragraph' | 'callout' | 'checklist' | 'quote' | 'links'
export type ProposalLink = { label: string; url: string }
export type ProposalBlock = { kind: ProposalBlockKind; title?: string; body?: string; items?: string[]; links?: ProposalLink[] }
export type ProposalStatus = 'awaiting_decision' | 'approved' | 'change_requested' | 'closed'
export type ClientProposal = {
  id: string; client_id: string; proposal_key: string; title: string; summary: string | null
  blocks: ProposalBlock[]; status: ProposalStatus; revision: number; submitted_at: string
  decided_at: string | null; decision_note: string | null; decided_by_name: string | null
  created_at: string; updated_at: string
}
export type ClientProposalMessage = {
  id: string; client_id: string; proposal_id: string; author_type: 'client' | 'anastasia'
  author_name: string; body: string; created_at: string
}

const kinds = new Set<ProposalBlockKind>(['heading', 'paragraph', 'callout', 'checklist', 'quote', 'links'])
const statuses = new Set<ProposalStatus>(['awaiting_decision', 'approved', 'change_requested', 'closed'])
function text(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= maximum ? value : undefined
}

export function parseProposalBlocks(value: unknown): ProposalBlock[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) throw new PortalDataError('Invalid proposal document')
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new PortalDataError('Invalid proposal block')
    const row = entry as Record<string, unknown>
    const kind = row.kind
    if (typeof kind !== 'string' || !kinds.has(kind as ProposalBlockKind)) throw new PortalDataError('Invalid proposal block kind')
    const title = text(row.title, 300); const body = text(row.body, 8000)
    const items = row.items === undefined ? undefined : Array.isArray(row.items) && row.items.length <= 50
      ? row.items.map((item) => text(item, 4000)).filter((item): item is string => Boolean(item)) : undefined
    const links = row.links === undefined ? undefined : Array.isArray(row.links) && row.links.length <= 20
      ? row.links.map((item) => {
          if (!item || typeof item !== 'object') throw new PortalDataError('Invalid proposal link')
          const link = item as Record<string, unknown>; const label = text(link.label, 300); const url = text(link.url, 2048)
          if (!label || !url || !/^https:\/\/[^\s]+$/u.test(url)) throw new PortalDataError('Invalid proposal link')
          return { label, url }
        }) : undefined
    if ((kind === 'heading' && !title) || (['paragraph', 'quote'].includes(kind) && !body)
      || (kind === 'callout' && !title && !body) || (kind === 'checklist' && !items?.length)
      || (kind === 'links' && !links?.length)) throw new PortalDataError('Incomplete proposal block')
    return { kind: kind as ProposalBlockKind, ...(title ? { title } : {}), ...(body ? { body } : {}), ...(items ? { items } : {}), ...(links ? { links } : {}) }
  })
}

function mapProposal(value: unknown): ClientProposal {
  if (!value || typeof value !== 'object') throw new PortalDataError('Invalid proposal row')
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.client_id !== 'string' || typeof row.proposal_key !== 'string'
    || typeof row.title !== 'string' || typeof row.revision !== 'number' || typeof row.submitted_at !== 'string'
    || typeof row.status !== 'string' || !statuses.has(row.status as ProposalStatus)) throw new PortalDataError('Invalid proposal state')
  return { ...row, summary: typeof row.summary === 'string' ? row.summary : null,
    blocks: parseProposalBlocks(row.blocks), status: row.status as ProposalStatus,
    decided_at: typeof row.decided_at === 'string' ? row.decided_at : null,
    decision_note: typeof row.decision_note === 'string' ? row.decision_note : null,
    decided_by_name: typeof row.decided_by_name === 'string' ? row.decided_by_name : null,
    created_at: String(row.created_at), updated_at: String(row.updated_at) } as ClientProposal
}

export async function getClientProposals(clientId: string): Promise<ClientProposal[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('client_proposals_client')
    .select('id,client_id,proposal_key,title,summary,blocks,status,revision,submitted_at,decided_at,decision_note,decided_by_name,created_at,updated_at')
    .eq('client_id', clientId).order('submitted_at', { ascending: false }).order('id', { ascending: false })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []).map(mapProposal)
}

export async function getClientProposal(clientId: string, proposalKey: string): Promise<ClientProposal | null> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('client_proposals_client')
    .select('id,client_id,proposal_key,title,summary,blocks,status,revision,submitted_at,decided_at,decision_note,decided_by_name,created_at,updated_at')
    .eq('client_id', clientId).eq('proposal_key', proposalKey).maybeSingle()
  if (error) throw new PortalDataError(error.message)
  return data ? mapProposal(data) : null
}

export async function getClientProposalMessages(clientId: string, proposalIds: string[]): Promise<ClientProposalMessage[]> {
  if (!proposalIds.length) return []
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('client_proposal_messages_client')
    .select('id,client_id,proposal_id,author_type,author_name,body,created_at')
    .eq('client_id', clientId).in('proposal_id', proposalIds).order('created_at', { ascending: true }).order('id', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []).flatMap((item) => {
    const row = item as Partial<ClientProposalMessage>
    return row.id && row.client_id && row.proposal_id && row.author_name && row.body && row.created_at
      && (row.author_type === 'client' || row.author_type === 'anastasia') ? [row as ClientProposalMessage] : []
  })
}
