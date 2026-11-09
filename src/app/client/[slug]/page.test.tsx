import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import styles from './overview.module.css'

vi.mock('next/link', () => ({ default: ({ href, children, ...props }: ComponentProps<'a'>) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: async () => ({ clientId: 'queue-fixture', name: 'Maria' }) }))
vi.mock('@/lib/portal/data', () => ({ getContent: async () => rows, getActivity: async () => [{ id:'a1', title:'Needs review: Episode 5', summary:'The new episode package is ready.',actor_name:'The Dot',actor_type:'anastasia',event_type:'needs_review',created_at:'2026-11-08T23:23:00Z'}] }))
vi.mock('@/lib/portal/publication', () => ({ getRecentPublishedContentIds: async () => [] }))
vi.mock('@/lib/portal/plan-cycle', () => ({ getOpenPlanCycles: async () => [{cycle:{id:'p1',title:'Content plan, November 9 to 13',week_start:'2026-11-09'}},{cycle:{id:'p2',title:'Content plan, November 16 to 20',week_start:'2026-11-16'}}], getUpcomingPlanCycles: async () => [] }))
vi.mock('@/lib/portal/schedule', () => ({ getSchedule: async () => [], routesToPiecePage: () => true, statusAccent: () => 'yellow' }))
vi.mock('@/lib/portal/seen', () => ({ getLastSeen: async () => null }))
vi.mock('@/lib/portal/requests', () => ({ getContentRequests: async () => [] }))
vi.mock('@/lib/portal/proposals', () => ({ getClientProposalMessages: async () => [], getClientProposals: async () => [{id:'guidance',proposal_key:'spouse-guidance',title:'Spouse update: guidance request',status:'awaiting_decision'}] }))
vi.mock('@/lib/portal/report-views', () => ({ getReportViewedAt: async () => '2026-11-01' }))
vi.mock('@/lib/portal/review-assets', () => ({ getCurrentReviewAssetsByItem: async () => new Map(rows.filter(row=>row.content_id!=='kanset-2026-10-marriage-application-update').map(row=>[row.id,[{asset_key:'reel-cover',channel:'social',asset_kind:'cover'}]])) }))
vi.mock('@/components/portal/WeekCalendar', () => ({ default: () => <p>Content calendar</p> }))
vi.mock('@/components/portal/CalendarLegend', () => ({ default: () => null }))
vi.mock('./MarkSeen', () => ({ default: () => null }))

const rows = [
 ['old-news','2026-11-02','LMIA decisions, Express Entry draws and new IRCC penalties'],
 ['student','2026-11-03','Online business on a Canadian study permit?'],
 ['new-news','2026-11-09','PR spaces, LMIA changes, Express Entry, rural PR and asylum'],
 ['full','2026-11-12','Women in business: work, family and boundaries | Kanset Talks Ep. 5'],
 ['teaser','2026-11-12','Kanset Talks Episode 5 teaser: women in business'],
 ['kanset-2026-10-ee-employer-nov3',null,'Express Entry offer rules change November 3'],
 ['kanset-2026-10-linkedin-ee-employer-nov3',null,'November 3 Express Entry changes: employer checks'],
 ['kanset-2026-10-marriage-application-update',null,'Marriage reported, spouse still in limbo?'],
 ['kanset-2026-10-study-shortlist',null,'Canada’s top ten universities: QS 2027'],
].map(([id,date,title])=>({id,content_id:id,planned_date:date,title,state:'needs_review',current_decision:null,version:1,format:id==='kanset-2026-10-marriage-application-update'?'editorial_brief':'reel',copy_blocks:[],canva_url:null,drive_url:null,platforms:id==='full'?['youtube']:id==='teaser'?['instagram','facebook','linkedin']:id==='kanset-2026-10-linkedin-ee-employer-nov3'?['linkedin']:['old-news','student','new-news'].includes(id!)?['instagram','facebook','youtube']:['instagram','facebook']}))

describe('overview review queue', () => {
 it('separates current work, overdue content and other decisions without hiding or duplicating pieces', async () => {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-08T23:30:00Z'))
  try {
   const { default: Overview } = await import('./page')
   const page=await Overview({params:Promise.resolve({slug:'kanset'})})
   render(page)
   expect(screen.getByText(/pieces need/)).toHaveTextContent('9 pieces need your review.')
   const next=screen.getByRole('heading',{name:'Review next (3)'}).closest('section')!
   const overdue=screen.getByRole('heading',{name:'Review overdue (6)'}).closest('section')!
   const other=screen.getByRole('heading',{name:'Plans and requests (3)'}).closest('section')!
   expect(within(next).getAllByRole('link')).toHaveLength(3)
   expect(within(overdue).getAllByRole('link')).toHaveLength(6)
   expect(within(other).getAllByRole('link')).toHaveLength(3)
   for(const row of rows)expect(screen.getAllByRole('link',{name:new RegExp(row.title!.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))})).toHaveLength(1)
   expect(within(overdue).queryByText(/Nov 2|Nov 3/)).not.toBeInTheDocument()
   expect(within(overdue).getByText('guidance needed')).toBeInTheDocument()
   const activity=screen.getByText('Show recent updates').closest('details')!
   expect(activity).not.toHaveAttribute('open')
   const proof=process.env.QUEUE_PROOF_DIR
   if(proof){
    mkdirSync(proof,{recursive:true})
    const css=readFileSync(join(process.cwd(),'src/app/client/[slug]/overview.module.css'),'utf8').replace(/\.([a-zA-Z][\w-]*)/g,(all,key)=>styles[key]?'.'+styles[key]:all)
    const ds=readFileSync(join(process.cwd(),'node_modules/@thedot/design-system/dist/index.css'),'utf8')
    writeFileSync(join(proof,'queue-body.html'),renderToStaticMarkup(page))
    writeFileSync(join(proof,'queue-styles.css'),ds+'\n'+css)
   }
  }finally{vi.useRealTimers()}
 })
})
