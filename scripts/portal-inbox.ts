import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, lstatSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, resolve, sep } from 'node:path'
import {
  applyCanonicalEdit,
  buildCanonicalCreate,
  resolveCanonicalEditCandidate,
  type EditPatch,
} from '../src/lib/portal/canonical-request-reconciler'
import { createCanonicalReconciliationCheckout } from '../src/lib/portal/canonical-reconciliation-checkout'
import { resolveReleasedCanonicalSource } from '../src/lib/portal/canonical-provenance'
import { parseContentFile, type ParsedContent } from '../src/lib/portal/frontmatter'

loadEnvConfig(process.cwd())
const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!key) throw new Error('Missing Supabase server environment')
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const consumer=process.env.PORTAL_INBOX_CONSUMER ?? 'kanset-ops-assist'

type ChangeRequest={id:string;client_id:string;content_id:string|null;request_type:'edit'|'create'|'archive';
  base_version:number|null;payload:Record<string,unknown>;status:string;requested_content_id:string|null}

function git(cwd:string,args:string[],stdio:'pipe'|'inherit'='pipe'){
  const output=execFileSync('git',['-C',cwd,...args],{
    encoding:'utf8',stdio:stdio==='pipe'?['ignore','pipe','pipe']:'inherit',
  })
  // Node returns null when stdio is inherited. Commands such as commit and push are
  // intentionally noisy, but successful output is not part of this tool's contract.
  return typeof output==='string'?output.trim():''
}
function canonicalRoot(){
  const dir=process.env.PORTAL_CONTENT_DIR; if(!dir) throw new Error('Missing PORTAL_CONTENT_DIR')
  const checkout=createCanonicalReconciliationCheckout({
    directory:dir,fixtureDirectory:join(process.cwd(),'content/portal'),supabaseUrl:url!,
    expectedRemote:process.env.PORTAL_CONTENT_EXPECTED_REMOTE,
  })
  process.once('exit',checkout.dispose)
  return {dir:checkout.directory,head:checkout.baseCommitSha,push:checkout.push}
}
function canonicalFile(dir:string, sourcePath:string):string{
  if(!/^[a-z0-9][a-z0-9._-]*\.md$/.test(sourcePath) || sourcePath.includes('/'))
    throw new Error('Canonical source path is not a safe root-level Markdown file')
  const root=resolve(dir); const candidate=resolve(root,sourcePath); const rel=relative(root,candidate)
  if(rel.startsWith(`..${sep}`)||rel==='..'||rel.startsWith(sep)||!rel) throw new Error('Canonical source path escapes its root')
  return candidate
}
function candidateFile(path:string):string{
  if(!path.startsWith('/')) throw new Error('Package candidate must use an absolute path')
  const stat=lstatSync(path)
  if(stat.isSymbolicLink()||!stat.isFile()) throw new Error('Package candidate must be a regular file, not a symlink')
  return readFileSync(path,'utf8')
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
function printSafePackageDiff(before:ParsedContent,after:ParsedContent){
  const beforeBlocks=new Map(before.copy_blocks.map((block)=>[block.key,block]))
  const afterBlocks=new Map(after.copy_blocks.map((block)=>[block.key,block]))
  const keys=[...new Set([...beforeBlocks.keys(),...afterBlocks.keys()])]
  for(const key of keys){
    const left=beforeBlocks.get(key);const right=afterBlocks.get(key)
    if(left?.body===right?.body&&left?.label===right?.label) continue
    console.log(`\nClient-visible package change: ${right?.label??left?.label??key}`)
    printSafeEditDiff(left?.body??'[block removed]',right?.body??'[block added]')
  }
  if(before.fact_check_exemption!==after.fact_check_exemption)
    console.log('\nRelease exemption note changed and will be rechecked at release.')
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
function normalText(value:string){
  // Portal textareas can retain invisible end-of-line spaces, while the canonical
  // repository correctly rejects them via `git diff --check`. Treat only that
  // non-rendering whitespace as equivalent so a visible verbatim edit can reconcile.
  return value.replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,'')
    .replace(/^[ \t\n]+|[ \t\n]+$/g,'')
}
function compatibleBlockKeys(blockKey:string){
  return blockKey==='ig-caption'||blockKey==='fb-caption'
    ? [blockKey,'ig-facebook-caption','social-caption']
    : [blockKey]
}
async function reviewCandidateTexts(
  requests:ChangeRequest[],requireApproved:boolean,
):Promise<Map<string,string>>{
  const requestIds=requests.map((request)=>request.id)
  const {data,error}=await admin.from('content_request_review_candidates')
    .select('request_id,candidate_text,status').in('request_id',requestIds)
  if(error) throw new Error(`Agency review candidates unavailable: ${error.message}`)
  const rows=new Map((data??[]).map((row)=>[row.request_id,row]))
  if(rows.size===0&&!requireApproved) return new Map()
  for(const request of requests){
    const row=rows.get(request.id)
    if(!row) throw new Error('Save a safe-merge candidate for every request in Agency Ops before using a package candidate')
    if(requireApproved&&row.status!=='approved')
      throw new Error('Approve every safe-merge candidate in Agency Ops before applying the package candidate')
  }
  return new Map([...rows].map(([requestId,row])=>[requestId,row.candidate_text]))
}
function validateEditPackageCandidate(
  raw:string,sourcePath:string,base:ParsedContent,
  requests:Array<{requestId?:string;blockKey:string;proposedText:string;reviewText?:string}>,
  expectedPlannedDate:string|null,allowPartialCandidate=false,
):ParsedContent{
  const candidate=parseContentFile(raw,sourcePath)
  if(candidate.content_id!==base.content_id||candidate.client!==base.client)
    throw new Error('Package candidate does not match the requested content identity')
  if(candidate.version!==base.version+1)
    throw new Error(`Package candidate must be version ${base.version+1}`)
  const preserved: Array<keyof ParsedContent>=[
    'portal_kind','title','producer','calendar_note','format','pillar','platforms',
    'status','canva_url','drive_url','fact_check','fact_check_scope','fact_check_ledger',
  ]
  if(preserved.some((key)=>JSON.stringify(candidate[key])!==JSON.stringify(base[key])))
    throw new Error('Package candidate changes workflow metadata outside the requested copy package')
  // The portal, not an old source snapshot, owns the current editorial date. A request
  // reconciliation may carry that already-recorded date forward into its new immutable
  // version, but it must never choose a different one or resurrect stale source metadata.
  if(candidate.scheduled_date!==expectedPlannedDate)
    throw new Error('Package candidate scheduled_date must exactly match the current portal planned date')
  const matchedKeys=new Set<string>()
  for(const request of requests){
    // A legacy single-platform caption may be intentionally consolidated into the
    // reviewed shared social package. This is the only allowed key transition, and
    // the requested text still has to match the receiving block exactly.
    const block=candidate.copy_blocks.find((row)=>compatibleBlockKeys(request.blockKey).includes(row.key))
    const candidateText=block?normalText(block.body):''
    const requestedText=normalText(request.proposedText)
    const reviewText=request.reviewText===undefined?null:normalText(request.reviewText)
    const exact=reviewText===null?candidateText===requestedText:candidateText===reviewText
    // Maria sometimes edits only the first sentence/field in the portal. In that case the
    // proposed text is an exact leading segment within the reviewed block, not a replacement
    // for the whole block. This mode is deliberately explicit and still prints the complete package
    // diff before apply, so the agency reviews every retained/additional line.
    const exactLeadingSegment=reviewText===null&&allowPartialCandidate&&requestedText.length>=20&&(
      candidateText.startsWith(`${requestedText} `)
      ||candidateText.startsWith(`${requestedText}\n`)
      ||candidateText.includes(`\n${requestedText} `)
      ||candidateText.includes(`\n${requestedText}\n`)
      ||candidateText.endsWith(`\n${requestedText}`)
    )
    if(!block||(!exact&&!exactLeadingSegment))
      throw new Error(reviewText===null
        ? 'Package candidate does not include Maria\'s requested copy as an exact block or leading segment'
        : 'Package candidate does not match the saved Agency Ops recommendation')
    if(matchedKeys.has(block.key)) throw new Error('Package candidate maps two requests to the same copy block')
    matchedKeys.add(block.key)
  }
  return candidate
}
async function reconcileEdit(client:{id:string;slug:string},requestId:string,apply:boolean,candidatePath:string|null){
  const request=await changeRequest(client.id,requestId)
  if(request.request_type!=='edit'||!request.content_id||!request.base_version)throw new Error('request is not an edit')
  const {data:snapshot,error}=await admin.from('content_item_versions')
    .select('source_path,source_commit_sha').eq('content_item_id',request.content_id)
    .eq('client_id',client.id).eq('version',request.base_version).single()
  if(error||!snapshot)throw new Error(`canonical provenance unavailable: ${error?.message??'missing'}`)
  const {data:item,error:itemError}=await admin.from('content_items').select('planned_date')
    .eq('id',request.content_id).eq('client_id',client.id).single()
  if(itemError||!item)throw new Error(`content item unavailable: ${itemError?.message??'missing'}`)
  const canonical=canonicalRoot(); const {dir,head}=canonical; const path=canonicalFile(dir,snapshot.source_path)
  const released=resolveReleasedCanonicalSource({git:(args)=>git(dir,args),sourceCommitSha:snapshot.source_commit_sha,
    canonicalBaseRef:head,sourcePath:snapshot.source_path})
  if(released.adoptedEquivalentTree) console.log('Recorded release history was rewritten; exact canonical file bytes verified.')
  const raw=released.raw; const blockKey=text(request.payload,'block_key')
  const originalChecksum=text(request.payload,'original_checksum');const proposedText=text(request.payload,'proposed_text')
  if(!blockKey||!originalChecksum||!proposedText)throw new Error('edit request payload is invalid')
  const base=parseContentFile(raw,snapshot.source_path)
  const edited=applyCanonicalEdit(raw,snapshot.source_path,request.base_version,{blockKey,originalChecksum,proposedText})
  const candidateRaw=candidatePath?candidateFile(candidatePath):edited.raw
  const reviewTexts=candidatePath?await reviewCandidateTexts([request],apply):new Map<string,string>()
  const parsed=candidatePath
    ?validateEditPackageCandidate(candidateRaw,snapshot.source_path,base,[{
      requestId:request.id,blockKey,proposedText,reviewText:reviewTexts.get(request.id),
    }],item.planned_date??null)
    :parseContentFile(candidateRaw,snapshot.source_path)
  if(!candidatePath&&parsed.scheduled_date!==(item.planned_date??null))
    throw new Error('Canonical source has a stale scheduled_date; provide a candidate that matches the current portal planned date')
  const candidateBlock=parsed.copy_blocks.find((row)=>row.key===blockKey)
  if(candidatePath){
    printSafePackageDiff(base,parsed)
    console.log(reviewTexts.size
      ? `Package candidate accepted: ${candidatePath}. It matches the saved Agency Ops recommendation.`
      : `Package candidate accepted: ${candidatePath}. Related copy changes are shown above, and Maria's requested block is exact.`)
  }else printSafeEditDiff(edited.before,candidateBlock?.body??edited.after)
  if(!apply){console.log('Preview only. Re-run with --apply after reviewing this client-visible diff.');return}
  await startJob(request,null,null,null)
  // From this point a failed command can leave a valid remote commit or a valid open DB job.
  // Open the DB revision before the irreversible canonical commit. A later Git or sync failure
  // leaves a recoverable open revision, never a committed source change that the DB refused.
  const begin=await admin.rpc('begin_content_request_revision',{
    p_request_id:request.id,p_content_id:request.content_id,p_content_version:request.base_version,
  })
  if(begin.error)throw new Error(begin.error.message)
  atomicWrite(path,candidateRaw);git(dir,['diff','--check','--',snapshot.source_path])
  git(dir,['add','--',snapshot.source_path]);git(dir,['commit','-m',`Apply portal edit request ${request.id}`],'inherit')
  const commit=canonical.push(snapshot.source_path)
  const synced=await admin.rpc('sync_content_item_versions',{p_items:[syncRow(parsed,client.id,commit)]})
  if(synced.error)throw new Error(synced.error.message)
  const prepared=await admin.rpc('mark_content_request_prepared',{p_request_id:request.id,p_commit_sha:commit,
    p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
  if(prepared.error)throw new Error(prepared.error.message)
  console.log(`Prepared edit request ${request.id} at ${commit}. Release review is still required.`)
}
async function reconcileEditBundle(
  client:{id:string;slug:string},requestIds:string[],apply:boolean,candidatePath:string|null,
  allowPartialCandidate=false,
){
  const requests=await Promise.all(requestIds.map((requestId)=>changeRequest(client.id,requestId)))
  if(requests.length<2||new Set(requests.map((request)=>request.id)).size!==requests.length)
    throw new Error('A bundled edit needs two or more distinct request IDs')
  const applying=requests.filter((request)=>request.status==='applying')
  if(applying.length>1) throw new Error('A bundled edit cannot have more than one applying lead request')
  const lead=applying[0]??requests[0]
  if(!lead.content_id||!lead.base_version||requests.some((request)=>request.request_type!=='edit'
    ||request.content_id!==lead.content_id||request.base_version!==lead.base_version
    ||!['pending','applying'].includes(request.status)))
    throw new Error('Bundled requests must be pending edits, with at most one applying lead, for the same content version')
  const patches:EditPatch[]=requests.map((request)=>{
    const blockKey=text(request.payload,'block_key'), originalChecksum=text(request.payload,'original_checksum')
    const proposedText=text(request.payload,'proposed_text')
    if(!blockKey||!originalChecksum||!proposedText) throw new Error('edit request payload is invalid')
    return {blockKey,originalChecksum,proposedText}
  })
  if(new Set(patches.map((patch)=>patch.blockKey)).size!==patches.length)
    throw new Error('Bundled requests must address distinct copy blocks')
  const {data:snapshot,error}=await admin.from('content_item_versions')
    .select('source_path,source_commit_sha').eq('content_item_id',lead.content_id)
    .eq('client_id',client.id).eq('version',lead.base_version).single()
  if(error||!snapshot) throw new Error(`canonical provenance unavailable: ${error?.message??'missing'}`)
  const {data:item,error:itemError}=await admin.from('content_items').select('planned_date')
    .eq('id',lead.content_id).eq('client_id',client.id).single()
  if(itemError||!item) throw new Error(`content item unavailable: ${itemError?.message??'missing'}`)
  const canonical=canonicalRoot(); const {dir,head}=canonical; const path=canonicalFile(dir,snapshot.source_path)
  const released=resolveReleasedCanonicalSource({git:(args)=>git(dir,args),sourceCommitSha:snapshot.source_commit_sha,
    canonicalBaseRef:head,sourcePath:snapshot.source_path})
  if(released.adoptedEquivalentTree) console.log('Recorded release history was rewritten; exact canonical file bytes verified.')
  const baseRaw=released.raw
  const base=parseContentFile(baseRaw,snapshot.source_path)
  const candidateRaw=resolveCanonicalEditCandidate({
    raw:baseRaw,sourcePath:snapshot.source_path,expectedVersion:lead.base_version,patches,
    approvedCandidateRaw:candidatePath?candidateFile(candidatePath):null,
  })
  const reviewTexts=candidatePath?await reviewCandidateTexts(requests,apply):new Map<string,string>()
  const parsed=candidatePath
    ?validateEditPackageCandidate(candidateRaw,snapshot.source_path,base,
      patches.map(({blockKey,proposedText},index)=>({requestId:requests[index].id,blockKey,proposedText,
        reviewText:reviewTexts.get(requests[index].id)})),item.planned_date??null,
      allowPartialCandidate)
    :parseContentFile(candidateRaw,snapshot.source_path)
  if(!candidatePath&&parsed.scheduled_date!==(item.planned_date??null))
    throw new Error('Canonical source has a stale scheduled_date; provide a candidate that matches the current portal planned date')
  if(candidatePath){
    printSafePackageDiff(base,parsed)
    console.log(reviewTexts.size
      ? `Package candidate accepted: ${candidatePath}. Every block matches its saved Agency Ops recommendation.`
      : `Package candidate accepted: ${candidatePath}. Every requested block is exact.`)
  }else printSafePackageDiff(base,parsed)
  if(!apply){console.log('Preview only. Re-run with --apply after reviewing this client-visible bundle diff.');return}
  if(lead.status==='pending') await startJob(lead,null,null,null)
  else console.log(`Resuming applying bundle lead ${lead.id}.`)
  const begin=await admin.rpc('begin_content_request_revision',{
    p_request_id:lead.id,p_content_id:lead.content_id,p_content_version:lead.base_version,
  })
  if(begin.error) throw new Error(begin.error.message)
  atomicWrite(path,candidateRaw);git(dir,['diff','--check','--',snapshot.source_path])
  const changed=git(dir,['status','--porcelain=v1','--',snapshot.source_path])
  let commit:string
  if(changed){
    git(dir,['add','--',snapshot.source_path]);git(dir,['commit','-m',`Apply portal edit requests ${requests.map((request)=>request.id).join(', ')}`],'inherit')
    commit=canonical.push(snapshot.source_path)
  }else{
    commit=git(dir,['rev-parse','HEAD'])
    if(git(dir,['show',`${commit}:${snapshot.source_path}`])!==candidateRaw.trimEnd())
      throw new Error('Unchanged canonical file does not match the reviewed package candidate')
    console.log(`Adopting already committed package candidate at ${commit}.`)
  }
  const synced=await admin.rpc('sync_content_item_versions',{p_items:[syncRow(parsed,client.id,commit)]})
  if(synced.error) throw new Error(synced.error.message)
  const prepared=await admin.rpc('mark_content_request_bundle_prepared',{
    p_request_ids:requests.map((request)=>request.id),p_commit_sha:commit,
    p_actor_key:'thedot-admin',p_idempotency_key:randomUUID(),
  })
  if(prepared.error) throw new Error(prepared.error.message)
  console.log(`Prepared ${requests.length} edit requests at ${commit}. Release review is still required.`)
}
async function resumeEdit(client:{id:string;slug:string},requestId:string,apply:boolean){
  const request=await changeRequest(client.id,requestId)
  if(request.request_type!=='edit'||!request.content_id||!request.base_version)
    throw new Error('request is not an edit')
  if(!['conflicted','applying'].includes(request.status))
    throw new Error('request is not a recoverable edit reconciliation')
  const {data:snapshot,error}=await admin.from('content_item_versions')
    .select('source_path,source_commit_sha').eq('content_item_id',request.content_id)
    .eq('client_id',client.id).eq('version',request.base_version).single()
  if(error||!snapshot)throw new Error(`canonical provenance unavailable: ${error?.message??'missing'}`)
  const {data:item,error:itemError}=await admin.from('content_items').select('planned_date')
    .eq('id',request.content_id).eq('client_id',client.id).single()
  if(itemError||!item)throw new Error(`content item unavailable: ${itemError?.message??'missing'}`)
  const {dir,head}=canonicalRoot(); const path=canonicalFile(dir,snapshot.source_path)
  const released=resolveReleasedCanonicalSource({git:(args)=>git(dir,args),sourceCommitSha:snapshot.source_commit_sha,
    canonicalBaseRef:`${head}^`,sourcePath:snapshot.source_path})
  if(released.adoptedEquivalentTree) console.log('Recorded release history was rewritten; exact canonical parent bytes verified.')
  const base=parseContentFile(released.raw,snapshot.source_path)
  const parsed=validateEditPackageCandidate(readFileSync(path,'utf8'),snapshot.source_path,base,[{
    blockKey:text(request.payload,'block_key')??'',proposedText:text(request.payload,'proposed_text')??'',
  }],item.planned_date??null)
  printSafePackageDiff(base,parsed)
  if(!apply){console.log('Resume preview only. Re-run with --apply after reviewing this client-visible diff.');return}
  if(request.status==='conflicted'){
    const resumed=await admin.rpc('resume_content_request_reconciliation',{
      p_request_id:request.id,p_actor_key:'thedot-admin',p_idempotency_key:randomUUID(),
    })
    if(resumed.error)throw new Error(resumed.error.message)
  }
  const begin=await admin.rpc('begin_content_request_revision',{
    p_request_id:request.id,p_content_id:request.content_id,p_content_version:request.base_version,
  })
  if(begin.error)throw new Error(begin.error.message)
  const synced=await admin.rpc('sync_content_item_versions',{p_items:[syncRow(parsed,client.id,head)]})
  if(synced.error)throw new Error(synced.error.message)
  const prepared=await admin.rpc('mark_content_request_prepared',{p_request_id:request.id,p_commit_sha:head,
    p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
  if(prepared.error)throw new Error(prepared.error.message)
  console.log(`Recovered and prepared edit request ${request.id} at ${head}. Release review is still required.`)
}
async function reconcileCreate(client:{id:string;slug:string},requestId:string,contentId:string,apply:boolean){
  const request=await changeRequest(client.id,requestId);if(request.request_type!=='create')throw new Error('request is not a create')
  const title=text(request.payload,'title'),brief=text(request.payload,'brief'),desiredDate=text(request.payload,'desired_date')
  const platforms=strings(request.payload,'platforms'),notes=text(request.payload,'notes')
  if(!title||!brief||!desiredDate||!platforms)throw new Error('create request payload is invalid')
  const canonical=canonicalRoot();const {dir,head}=canonical;const sourcePath=`${contentId}.md`;const path=join(dir,sourcePath)
  if(existsSync(path))throw new Error('canonical create target already exists')
  const raw=buildCanonicalCreate(contentId,client.slug,{title,brief,desiredDate,platforms,notes},sourcePath)
  console.log(`Create preview: ${sourcePath}; title=${JSON.stringify(title)}; destinations=${platforms.join(', ')}.`)
  console.log('The generated v1 is needs-confirm and cannot be released until actual copy/evidence are reviewed.')
  if(!apply){console.log('Preview only. Re-run with --apply after reviewing the request.');return}
  await startJob(request,contentId,sourcePath,head);atomicWrite(path,raw)
  git(dir,['diff','--check','--',sourcePath]);git(dir,['add','--',sourcePath])
  git(dir,['commit','-m',`Create canonical draft for portal request ${request.id}`],'inherit')
  const commit=canonical.push(sourcePath)
  const parsed=parseContentFile(raw,sourcePath)
  const synced=await admin.rpc('sync_content_item_versions',{p_items:[syncRow(parsed,client.id,commit)]})
  if(synced.error)throw new Error(synced.error.message)
  const prepared=await admin.rpc('mark_content_request_prepared',{p_request_id:request.id,p_commit_sha:commit,
    p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
  if(prepared.error)throw new Error(prepared.error.message)
  console.log(`Prepared create request ${request.id} at ${commit}. Authoring, fact-check, and release review remain.`)
}
async function reconcileArchive(clientId:string,requestId:string,apply:boolean){
  const request=await changeRequest(clientId,requestId);if(request.request_type!=='archive')throw new Error('request is not an archive')
  console.log(`Archive preview: request ${request.id}, base version ${request.base_version}; history will be retained.`)
  if(!apply){console.log('Preview only. Re-run with --apply after reviewing the request.');return}
  await startJob(request,null,null,null)
  const result=await admin.rpc('apply_content_archive_request',{p_request_id:request.id,
    p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
  if(result.error)throw new Error(result.error.message)
  console.log(`Applied archive request ${request.id}; history is retained.`)
}
async function supersedeRequest(client:{id:string;slug:string},requestId:string,versionText:string,note:string){
  const request=await changeRequest(client.id,requestId)
  const version=Number(versionText)
  if(request.request_type!=='edit'||!request.content_id) throw new Error('request is not an edit')
  if(!Number.isInteger(version)||version<1) throw new Error('replacement version must be an integer >= 1')
  const message=note.trim()
  if(message.length<3||message.length>2000) throw new Error('client-safe explanation must be 3..2000 characters')
  const result=await admin.rpc('supersede_content_request_with_released_version',{
    p_request_id:request.id,p_content_id:request.content_id,p_content_version:version,p_note:message,
    p_actor_key:'thedot-admin',p_idempotency_key:randomUUID(),
  })
  if(result.error) throw new Error(result.error.message)
  console.log(`Superseded request ${request.id} against released v${version}; the original proposal is not claimed as verbatim applied.`)
}
function parseEditFlags(args:string[]):{apply:boolean;candidatePath:string|null}{
  let apply=false;let candidatePath:string|null=null
  for(let index=0;index<args.length;index+=1){
    const arg=args[index]
    if(arg==='--apply'){apply=true;continue}
    if(arg==='--candidate'){
      const value=args[index+1]
      if(!value||value.startsWith('--')||candidatePath) throw new Error('apply-edit accepts one --candidate <absolute-path>')
      candidatePath=value;index+=1;continue
    }
    throw new Error('apply-edit accepts only --apply and optional --candidate <absolute-path>')
  }
  return {apply,candidatePath}
}
function parseBatchEditArgs(firstRequestId:string|undefined,args:string[]):{
  requestIds:string[];apply:boolean;candidatePath:string|null;allowPartialCandidate:boolean
}{
  const requestIds:string[]=[]; if(firstRequestId) requestIds.push(firstRequestId)
  let apply=false;let candidatePath:string|null=null;let allowPartialCandidate=false
  for(let index=0;index<args.length;index+=1){
    const arg=args[index]
    if(arg==='--apply'){apply=true;continue}
    if(arg==='--partial-candidate'){allowPartialCandidate=true;continue}
    if(arg==='--candidate'){
      const value=args[index+1]
      if(!value||value.startsWith('--')||candidatePath) throw new Error('apply-edit-batch accepts one --candidate <absolute-path>')
      candidatePath=value;index+=1;continue
    }
    if(arg.startsWith('--')) throw new Error('apply-edit-batch accepts request IDs, --apply, --partial-candidate, and optional --candidate <absolute-path>')
    requestIds.push(arg)
  }
  if(requestIds.length<2||new Set(requestIds).size!==requestIds.length)
    throw new Error('apply-edit-batch needs two or more distinct request IDs')
  if(allowPartialCandidate&&!candidatePath)
    throw new Error('--partial-candidate requires an explicit reviewed --candidate file')
  return {requestIds,apply,candidatePath,allowPartialCandidate}
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
    if(!value)throw new Error('usage: portal-inbox apply-edit <clientSlug> <request-uuid> [--candidate <absolute-path>] [--apply]')
    const flags=parseEditFlags(rest)
    await reconcileEdit(client,value,flags.apply,flags.candidatePath)
  }else if(command==='apply-edit-batch'){
    const flags=parseBatchEditArgs(value,rest)
    await reconcileEditBundle(client,flags.requestIds,flags.apply,flags.candidatePath,flags.allowPartialCandidate)
  }else if(command==='resume-edit'){
    if(!value||rest.length!==1||rest[0]!=='--apply')
      throw new Error('usage: portal-inbox resume-edit <clientSlug> <request-uuid> --apply')
    await resumeEdit(client,value,true)
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
  }else if(command==='supersede'){
    const [version,note,...extra]=rest
    if(!value||!version||!note||extra.length) throw new Error('usage: portal-inbox supersede <clientSlug> <request-uuid> <released-version> "<client-safe explanation>"')
    await supersedeRequest(client,value,version,note)
  }else if(command==='reject'){
    const reason=rest.join(' ').trim();if(!value||reason.length<3)throw new Error('usage: portal-inbox reject <clientSlug> <request-uuid> <reason>')
    const request=await changeRequest(client.id,value)
    const result=await admin.rpc('resolve_content_request',{p_request_id:request.id,p_status:'rejected',
      p_reason:reason,p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
    if(result.error)throw new Error(result.error.message);console.log(`Rejected request ${request.id}.`)
  }else throw new Error('usage: portal-inbox <list|show|ack|apply-edit|apply-edit-batch|resume-edit|apply-create|apply-archive|supersede|reject|retry-projections> <clientSlug> [value]')
}
main().catch((error)=>{console.error(`FAILED: ${error?.message ?? error}`);process.exit(1)})
