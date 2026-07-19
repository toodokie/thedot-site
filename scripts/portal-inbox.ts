import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())
const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!key) throw new Error('Missing Supabase server environment')
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const consumer=process.env.PORTAL_INBOX_CONSUMER ?? 'kanset-ops-assist'

async function main(){
  const [command='list',slug='kanset',value]=process.argv.slice(2)
  const {data:client,error}=await admin.from('clients').select('id').eq('slug',slug).single()
  if(error||!client) throw new Error(`client unavailable: ${error?.message ?? 'missing'}`)
  if(command==='list'){
    const limit=value ? Number(value) : 100
    if(!Number.isInteger(limit)||limit<1||limit>500) throw new Error('limit must be 1..500')
    const result=await admin.rpc('read_portal_inbox',{p_consumer_key:consumer,p_client_id:client.id,p_limit:limit})
    if(result.error) throw new Error(result.error.message)
    const rows=(result.data ?? []) as Array<Record<string,unknown>>
    if(!rows.length){console.log(`Inbox clear for ${slug}.`);return}
    for(const row of rows) console.log(`${row.seq} ${row.created_at} ${row.event_type} ${row.object_type} ${row.actor_name}${row.requires_reconciliation?' [RECONCILE]':''} ${row.id}`)
  }else if(command==='show'){
    if(!value) throw new Error('usage: portal-inbox show <clientSlug> <event-or-object-uuid>')
    const result=await admin.rpc('show_portal_inbox_event',{p_client_id:client.id,p_event_id:value})
    if(result.error) throw new Error(result.error.message)
    console.dir(result.data,{depth:null})
  }else if(command==='ack'){
    const seq=Number(value); if(!Number.isInteger(seq)||seq<1) throw new Error('ack requires an event sequence')
    const result=await admin.rpc('ack_portal_inbox',{p_consumer_key:consumer,p_client_id:client.id,p_seq:seq})
    if(result.error) throw new Error(result.error.message)
    console.log(`Acknowledged through ${result.data} for ${slug}.`)
  }else if(command==='retry-projections'){
    const result=await admin.rpc('retry_portal_projections',{p_client_id:client.id})
    if(result.error) throw new Error(result.error.message)
    console.log(`Requeued ${result.data} definite projection failure(s) for ${slug}.`)
  }else throw new Error('usage: portal-inbox <list|show|ack|retry-projections> <clientSlug> [value]')
}
main().catch((error)=>{console.error(`FAILED: ${error?.message ?? error}`);process.exit(1)})
