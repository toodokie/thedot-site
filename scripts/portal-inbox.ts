import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, resolve, sep } from 'node:path'
import { applyCanonicalEdit, buildCanonicalCreate } from '../src/lib/portal/canonical-request-reconciler'
import { inspectCanonicalContentRoot } from '../src/lib/portal/canonical-content-root'
import { parseContentFile, type ParsedContent } from '../src/lib/portal/frontmatter'

loadEnvConfig(process.cwd())
const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!key) throw new Error('Missing Supabase server environment')
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const consumer=process.env.PORTAL_INBOX_CONSUMER ?? 'kanset-ops-assist'

type ChangeRequest={id:string;client_id:string;content_id:string|null;request_type:'edit'|'create'|'archive';
  base_version:number|null;payload:Record<string,unknown>;status:string;requested_content_id:string|null}

function git(cwd:string,args:string[],stdio:'pipe'|'inherit'='pipe'){
  return execFileSync('git',['-C',cwd,...args],{encoding:'utf8',stdio:stdio==='pipe'?['ignore','pipe','pipe']:'inherit'}).trim()
}
function canonicalRoot(){
  const dir=process.env.PORTAL_CONTENT_DIR; if(!dir) throw new Error('Missing PORTAL_CONTENT_DIR')
  inspectCanonicalContentRoot({directory:dir,fixtureDirectory:join(process.cwd(),'content/portal'),
    supabaseUrl:url!,mode:'apply',expectedRemote:process.env.PORTAL_CONTENT_EXPECTED_REMOTE})
  if(git(dir,['status','--porcelain=v1','--untracked-files=all'])) throw new Error('Canonical repository is dirty')
  git(dir,['fetch','--quiet','origin'])
  const head=git(dir,['rev-parse','HEAD']); const upstream=git(dir,['rev-parse','@{upstream}'])
  if(head!==upstream) throw new Error('Canonical repository is not exactly at its upstream head')
  return {dir,head}
}
function canonicalFile(dir:string, sourcePath:string):string{
  if(!/^[a-z0-9][a-z0-9._-]*\.md$/.test(sourcePath) || sourcePath.includes('/'))
    throw new Error('Canonical source path is not a safe root-level Markdown file')
  const root=resolve(dir); const candidate=resolve(root,sourcePath); const rel=relative(root,candidate)
  if(rel.startsWith(`..${sep}`)||rel==='..'||rel.startsWith(sep)||!rel) throw new Error('Canonical source path escapes its root')
  return candidate
}
function atomicWrite(path:string,raw:string){
  const tmp=`${path}.portal-${process.pid}-${randomUUID()}.tmp`; const mode=existsSync(path)?statSync(path).mode:0o600
  let fd:number|undefined
  try{fd=openSync(tmp,'wx',mode);writeFileSync(fd,raw,'utf8');closeSync(fd);fd=undefined;renameSync(tmp,path)}
  finally{if(fd!==undefined)closeSync(fd);if(existsSync(tmp))unlinkSync(tmp)}
}
async function changeRequest(clientId:string,id:string):Promise<ChangeRequest>{
  const result=await admin.rpc('list_content_change_requests',{p_client_id:clientId})
  if(result.error) throw new Error(result.error.message)
  const request=(result.data as ChangeRequest[]|null)?.find((row)=>row.id===id)
  if(!request) throw new Error('content request not found for client')
  return request
}
function text(payload:Record<string,unknown>,key:string){const value=payload[key];return typeof value==='string'?value:null}
function strings(payload:Record<string,unknown>,key:string){const value=payload[key];return Array.isArray(value)&&value.every((v)=>typeof v==='string')?value as string[]:null}
function printSafeEditDiff(before:string,after:string){
  console.log('Client-visible block diff (internal notes are intentionally omitted):')
  console.log(`- ${before.replace(/\n/g,'\n- ')}`);console.log(`+ ${after.replace(/\n/g,'\n+ ')}`)
}
function syncRow(parsed:ParsedContent,clientId:string,commit:string){return {content_id:parsed.content_id,
  client_id:clientId,title:parsed.title,producer:parsed.producer,calendar_note:parsed.calendar_note,
  format:parsed.format,pillar:parsed.pillar,platforms:parsed.platforms,
  planned_date:parsed.scheduled_date,canva_url:parsed.canva_url,drive_url:parsed.drive_url,version:parsed.version,
  fact_check:parsed.fact_check,fact_check_scope:parsed.fact_check_scope,
  fact_check_exemption:parsed.fact_check_exemption,fact_check_ledger:parsed.fact_check_ledger,
  client_body:parsed.client_body,copy_blocks:parsed.copy_blocks,source_path:parsed.source_path,
  source_commit_sha:commit}}

async function startJob(request:ChangeRequest,contentId:string|null,file:string|null,head:string|null){
  const result=await admin.rpc('start_content_request_reconciliation',{p_request_id:request.id,
    p_requested_content_id:contentId,p_canonical_object_key:file,p_expected_base_commit:head,
    p_actor_key:'thedot-admin',p_idempotency_key:request.id})
  if(result.error) throw new Error(result.error.message)
}
async function markConflict(requestId:string){
  await admin.rpc('resolve_content_request',{p_request_id:requestId,p_status:'conflicted',
    p_reason:'Local reconciliation failed a checked precondition. The canonical checkout and request require review.',
    p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
}
async function reconcileEdit(client:{id:string;slug:string},requestId:string,apply:boolean){
  const request=await changeRequest(client.id,requestId)
  if(request.request_type!=='edit'||!request.content_id||!request.base_version)throw new Error('request is not an edit')
  const {data:snapshot,error}=await admin.from('content_item_versions')
    .select('source_path,source_commit_sha').eq('content_item_id',request.content_id)
    .eq('client_id',client.id).eq('version',request.base_version).single()
  if(error||!snapshot)throw new Error(`canonical provenance unavailable: ${error?.message??'missing'}`)
  const {dir}=canonicalRoot(); const path=canonicalFile(dir,snapshot.source_path)
  const raw=readFileSync(path,'utf8'); const blockKey=text(request.payload,'block_key')
  const originalChecksum=text(request.payload,'original_checksum');const proposedText=text(request.payload,'proposed_text')
  if(!blockKey||!originalChecksum||!proposedText)throw new Error('edit request payload is invalid')
  const edited=applyCanonicalEdit(raw,snapshot.source_path,request.base_version,{blockKey,originalChecksum,proposedText})
  printSafeEditDiff(edited.before,edited.after)
  if(!apply){console.log('Preview only. Re-run with --apply after reviewing this client-visible diff.');return}
  let started=false
  try{
    await startJob(request,null,null,null);started=true
    atomicWrite(path,edited.raw);git(dir,['diff','--check','--',snapshot.source_path])
    git(dir,['add','--',snapshot.source_path]);git(dir,['commit','-m',`Apply portal edit request ${request.id}`],'inherit')
    git(dir,['push','origin','HEAD'],'inherit');const commit=git(dir,['rev-parse','HEAD'])
    const begin=await admin.rpc('begin_content_revision',{p_content_id:request.content_id,p_content_version:request.base_version})
    if(begin.error)throw new Error(begin.error.message)
    const parsed=parseContentFile(edited.raw,snapshot.source_path)
    const synced=await admin.rpc('sync_content_item_versions',{p_items:[syncRow(parsed,client.id,commit)]})
    if(synced.error)throw new Error(synced.error.message)
    const prepared=await admin.rpc('mark_content_request_prepared',{p_request_id:request.id,p_commit_sha:commit,
      p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
    if(prepared.error)throw new Error(prepared.error.message)
    console.log(`Prepared edit request ${request.id} at ${commit}. Release review is still required.`)
  }catch(error){if(started)await markConflict(request.id);throw error}
}
async function reconcileCreate(client:{id:string;slug:string},requestId:string,contentId:string,apply:boolean){
  const request=await changeRequest(client.id,requestId);if(request.request_type!=='create')throw new Error('request is not a create')
  const title=text(request.payload,'title'),brief=text(request.payload,'brief'),desiredDate=text(request.payload,'desired_date')
  const platforms=strings(request.payload,'platforms'),notes=text(request.payload,'notes')
  if(!title||!brief||!desiredDate||!platforms)throw new Error('create request payload is invalid')
  const {dir,head}=canonicalRoot();const sourcePath=`${contentId}.md`;const path=join(dir,sourcePath)
  if(existsSync(path))throw new Error('canonical create target already exists')
  const raw=buildCanonicalCreate(contentId,client.slug,{title,brief,desiredDate,platforms,notes},sourcePath)
  console.log(`Create preview: ${sourcePath}; title=${JSON.stringify(title)}; destinations=${platforms.join(', ')}.`)
  console.log('The generated v1 is needs-confirm and cannot be released until actual copy/evidence are reviewed.')
  if(!apply){console.log('Preview only. Re-run with --apply after reviewing the request.');return}
  let started=false
  try{
    await startJob(request,contentId,sourcePath,head);started=true;atomicWrite(path,raw)
    git(dir,['diff','--check','--',sourcePath]);git(dir,['add','--',sourcePath])
    git(dir,['commit','-m',`Create canonical draft for portal request ${request.id}`],'inherit')
    git(dir,['push','origin','HEAD'],'inherit');const commit=git(dir,['rev-parse','HEAD'])
    const parsed=parseContentFile(raw,sourcePath)
    const synced=await admin.rpc('sync_content_item_versions',{p_items:[syncRow(parsed,client.id,commit)]})
    if(synced.error)throw new Error(synced.error.message)
    const prepared=await admin.rpc('mark_content_request_prepared',{p_request_id:request.id,p_commit_sha:commit,
      p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
    if(prepared.error)throw new Error(prepared.error.message)
    console.log(`Prepared create request ${request.id} at ${commit}. Authoring, fact-check, and release review remain.`)
  }catch(error){if(started)await markConflict(request.id);throw error}
}
async function reconcileArchive(clientId:string,requestId:string,apply:boolean){
  const request=await changeRequest(clientId,requestId);if(request.request_type!=='archive')throw new Error('request is not an archive')
  console.log(`Archive preview: request ${request.id}, base version ${request.base_version}; history will be retained.`)
  if(!apply){console.log('Preview only. Re-run with --apply after reviewing the request.');return}
  let started=false
  try{await startJob(request,null,null,null);started=true
    const result=await admin.rpc('apply_content_archive_request',{p_request_id:request.id,
      p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
    if(result.error)throw new Error(result.error.message)
    console.log(`Applied archive request ${request.id}; history is retained.`)
  }catch(error){if(started)await markConflict(request.id);throw error}
}

async function main(){
  const [command='list',slug='kanset',value,...rest]=process.argv.slice(2)
  const {data:client,error}=await admin.from('clients').select('id,slug').eq('slug',slug).single()
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
  }else if(command==='apply-edit'){
    if(!value)throw new Error('usage: portal-inbox apply-edit <clientSlug> <request-uuid> [--apply]')
    if(rest.some((arg)=>arg!=='--apply'))throw new Error('only --apply is accepted')
    await reconcileEdit(client,value,rest.includes('--apply'))
  }else if(command==='apply-create'){
    const contentId=rest.find((arg)=>arg!=='--apply')
    if(!value||!contentId||!/^[a-z0-9][a-z0-9._-]{1,119}$/.test(contentId))
      throw new Error('usage: portal-inbox apply-create <clientSlug> <request-uuid> <content-id> [--apply]')
    if(rest.filter((arg)=>arg!=='--apply').length!==1)throw new Error('exactly one content id is required')
    await reconcileCreate(client,value,contentId,rest.includes('--apply'))
  }else if(command==='apply-archive'){
    if(!value)throw new Error('usage: portal-inbox apply-archive <clientSlug> <request-uuid> [--apply]')
    if(rest.some((arg)=>arg!=='--apply'))throw new Error('only --apply is accepted')
    await reconcileArchive(client.id,value,rest.includes('--apply'))
  }else if(command==='reject'){
    const reason=rest.join(' ').trim();if(!value||reason.length<3)throw new Error('usage: portal-inbox reject <clientSlug> <request-uuid> <reason>')
    const request=await changeRequest(client.id,value)
    const result=await admin.rpc('resolve_content_request',{p_request_id:request.id,p_status:'rejected',
      p_reason:reason,p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
    if(result.error)throw new Error(result.error.message);console.log(`Rejected request ${request.id}.`)
  }else throw new Error('usage: portal-inbox <list|show|ack|apply-edit|apply-create|apply-archive|reject|retry-projections> <clientSlug> [value]')
}
main().catch((error)=>{console.error(`FAILED: ${error?.message ?? error}`);process.exit(1)})
