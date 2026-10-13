-- Slice 6: atomic agency-owned portal surfaces and durable agency inbox consumption.
-- Supabase is authoritative. Service callers execute reviewed RPCs; they never write the
-- recommendations, links, reports, communications, activity, inbox, or projection tables directly.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.agency_actors') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null then
    raise exception '0010 calendar objects must exist before applying 0011';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice5_security;
revoke all on function public.assert_portal_slice5_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice5_security() to service_role;

-- Stable keys and private provenance for agency-owned, client-read-only surfaces.
alter table public.recommendations
  add column source_key text,
  add column source_type text,
  add column source_ref text,
  add column provenance jsonb,
  add column status text,
  add column revision bigint,
  add column updated_at timestamptz;

update public.recommendations
set source_key = 'legacy:' || id::text,
    source_type = 'historical_import',
    source_ref = 'migration:0011',
    provenance = pg_catalog.jsonb_build_object('migrated',true),
    status = 'active', revision = 1, updated_at = created_at;

alter table public.recommendations
  alter column source_key set not null,
  alter column source_type set not null,
  alter column source_ref set not null,
  alter column provenance set not null,
  alter column status set not null,
  alter column revision set not null,
  alter column updated_at set not null,
  alter column status set default 'active',
  alter column revision set default 1,
  alter column updated_at set default pg_catalog.now(),
  add constraint recommendations_source_key_format check (source_key ~ '^[a-z0-9][a-z0-9._:-]{1,199}$'),
  add constraint recommendations_source_type_check check (source_type in (
    'strategy_review','performance_review','client_request','historical_import'
  )),
  add constraint recommendations_provenance_object check (pg_catalog.jsonb_typeof(provenance)='object'),
  add constraint recommendations_status_check check (status in ('active','archived')),
  add constraint recommendations_revision_positive check (revision > 0),
  add constraint recommendations_client_source_unique unique (client_id,source_key);

alter table public.links
  add column link_key text,
  add column source_type text,
  add column source_ref text,
  add column revision bigint,
  add column updated_at timestamptz;

update public.links
set link_key = 'legacy:' || id::text,
    source_type = 'historical_import', source_ref = 'migration:0011',
    revision = 1, updated_at = created_at;

alter table public.links
  alter column link_key set not null,
  alter column source_type set not null,
  alter column source_ref set not null,
  alter column revision set not null,
  alter column updated_at set not null,
  alter column revision set default 1,
  alter column updated_at set default pg_catalog.now(),
  add constraint links_link_key_format check (link_key ~ '^[a-z0-9][a-z0-9._:-]{1,199}$'),
  add constraint links_source_type_check check (source_type in ('agency_curated','historical_import')),
  add constraint links_revision_positive check (revision > 0),
  add constraint links_client_key_unique unique (client_id,link_key),
  add constraint links_https_url check (
    pg_catalog.char_length(url) between 9 and 2048
    and url ~ '^https://[^[:space:][:cntrl:]]+$'
    and url !~ '^https://[^/?#]*@'
  );

create table public.portal_client_link_hosts (
  hostname text primary key check (hostname=pg_catalog.lower(hostname)
    and hostname ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$')
);
insert into public.portal_client_link_hosts(hostname) values
  ('kanset.com'),('canva.com'),('drive.google.com'),('docs.google.com'),('youtube.com'),
  ('youtu.be'),('instagram.com'),('facebook.com'),('linkedin.com'),('www.thedotcreative.co');
alter table public.portal_client_link_hosts enable row level security;

create or replace function public.portal_client_link_url_valid(p_url text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_authority text; v_host text;
begin
  if p_url is null or p_url !~ '^https://[^[:space:][:cntrl:]]+$' or p_url ~ '^https://[^/?#]*@'
    then return false; end if;
  v_authority:=pg_catalog.substring(p_url,'^https://([^/?#]+)');
  if v_authority is null or v_authority ~ '@' then return false; end if;
  v_host:=pg_catalog.lower(pg_catalog.rtrim(pg_catalog.regexp_replace(v_authority,':[0-9]+$',''),'.'));
  return exists(select 1 from public.portal_client_link_hosts h
    where v_host=h.hostname or v_host like '%.'||h.hostname);
end;
$$;
revoke all on function public.portal_client_link_url_valid(text) from public,anon,authenticated,service_role;

do $$
begin
  if exists(select 1 from public.links l where not public.portal_client_link_url_valid(l.url)) then
    raise exception 'unreviewed legacy client link blocks 0011; classify/remove it before migration';
  end if;
end;
$$;

create or replace function public.portal_report_metrics_valid(p_metrics jsonb,p_schema_version int)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_value jsonb; v_keys text[];
begin
  if p_schema_version = 0 then return pg_catalog.jsonb_typeof(p_metrics)='object'; end if;
  if p_schema_version <> 1 or pg_catalog.jsonb_typeof(p_metrics) <> 'object' then return false; end if;
  for v_value in select value from pg_catalog.jsonb_each(p_metrics) loop
    if pg_catalog.jsonb_typeof(v_value) in ('number','null') then continue; end if;
    if pg_catalog.jsonb_typeof(v_value) <> 'object' then return false; end if;
    select pg_catalog.array_agg(k order by k) into v_keys
      from pg_catalog.jsonb_object_keys(v_value) k;
    if v_keys not in (array['value']::text[],array['prev','value']::text[]) then return false; end if;
    if pg_catalog.jsonb_typeof(v_value->'value') not in ('number','null')
       or (v_value ? 'prev' and pg_catalog.jsonb_typeof(v_value->'prev') not in ('number','null'))
      then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.portal_report_metrics_valid(jsonb,int) from public,anon,authenticated,service_role;

alter table public.report_snapshots
  add column schema_version int,
  add column period_start date,
  add column period_end date,
  add column collected_at timestamptz,
  add column source_type text,
  add column source_ref text,
  add column source_checksum text,
  add column revision bigint,
  add column updated_at timestamptz;

update public.report_snapshots
set schema_version = 0,
    period_start = case when period ~ '^[0-9]{4}-[0-9]{2}-H[12]$'
      then (pg_catalog.substring(period,1,7) || case when pg_catalog.right(period,2)='H1' then '-01' else '-16' end)::date
      else created_at::date end,
    period_end = case when period ~ '^[0-9]{4}-[0-9]{2}-H[12]$'
      then case when pg_catalog.right(period,2)='H1'
        then (pg_catalog.substring(period,1,7)||'-15')::date
        else ((pg_catalog.substring(period,1,7)||'-01')::date + interval '1 month - 1 day')::date end
      else created_at::date end,
    collected_at = created_at, source_type = 'manual_calculation',
    source_ref = 'migration:0011',
    source_checksum = pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(metrics::text,'UTF8'),'sha256'),'hex'),
    revision = 1, updated_at = created_at;

alter table public.report_snapshots
  alter column schema_version set not null,
  alter column period_start set not null,
  alter column period_end set not null,
  alter column collected_at set not null,
  alter column source_type set not null,
  alter column source_ref set not null,
  alter column source_checksum set not null,
  alter column revision set not null,
  alter column updated_at set not null,
  alter column revision set default 1,
  alter column updated_at set default pg_catalog.now(),
  add constraint report_schema_version_nonnegative check (schema_version >= 0),
  add constraint report_period_order check (period_end >= period_start),
  add constraint report_source_type_check check (source_type in (
    'platform_export','platform_ui','manual_calculation'
  )),
  add constraint report_source_checksum_format check (source_checksum ~ '^[0-9a-f]{64}$'),
  add constraint report_revision_positive check (revision > 0),
  add constraint report_metrics_schema check (public.portal_report_metrics_valid(metrics,schema_version)),
  add constraint report_snapshot_natural_key unique (
    client_id,period_start,period_end,platform,schema_version
  );

-- Honest external decisions: the effective actor is the known tenant contact, while the source
-- and agency recorder remain explicit. The browser cannot choose decision_actor_key.
alter table public.approvals
  add column decision_source text,
  add column decision_actor_key text,
  add column actor_name text,
  add column recorded_by uuid references public.agency_actors(id),
  add column source_occurred_at timestamptz,
  add column idempotency_key text;

update public.approvals a set
  decision_source='portal',
  decision_actor_key='auth:'||a.decided_by::text,
  actor_name=coalesce((select cu.name from public.client_users cu
    where cu.client_id=a.client_id and cu.auth_user_id=a.decided_by limit 1),'Client'),
  source_occurred_at=a.created_at;

alter table public.approvals
  alter column decision_source set not null,
  alter column decision_actor_key set not null,
  alter column actor_name set not null,
  alter column source_occurred_at set not null,
  alter column decided_by drop not null,
  add constraint approvals_decision_source_check check (decision_source in ('portal','email','call')),
  add constraint approvals_actor_key_format check (decision_actor_key ~ '^auth:[0-9a-f-]{36}$'),
  add constraint approvals_external_provenance check (
    (decision_source='portal' and decided_by is not null and recorded_by is null)
    or (decision_source in ('email','call') and decided_by is null and recorded_by is not null)
  );

drop index public.approvals_one_per_version;
create unique index approvals_one_effective_decision
  on public.approvals(content_id,content_version,decision_actor_key);
create unique index approvals_external_idempotency
  on public.approvals(client_id,idempotency_key) where idempotency_key is not null;

-- Keep the heavily-asserted scheduling/decision state machine from 0008 intact; alter only its
-- actor lookup and approval upsert so both portal and external decisions share one effective row.
do $rewrite_portal_decision$
declare v_definition text; v_next text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_content_decision(uuid,integer,text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_next := pg_catalog.replace(v_definition,
    'and a.decided_by = v_uid;',
    'and a.decision_actor_key = ''auth:'' || v_uid::text;');
  v_next := pg_catalog.replace(v_next,
    E'insert into public.approvals (content_id, client_id, content_version, state, note, decided_by)\n  values (p_content_id, v_ci.client_id, p_content_version, p_decision, v_note, v_uid)\n  on conflict (content_id, content_version, decided_by)',
    E'insert into public.approvals (content_id, client_id, content_version, state, note, decided_by, decision_source, decision_actor_key, actor_name, source_occurred_at)\n  values (p_content_id, v_ci.client_id, p_content_version, p_decision, v_note, v_uid, ''portal'', ''auth:'' || v_uid::text, coalesce(v_actor, ''Client''), pg_catalog.now())\n  on conflict (content_id, content_version, decision_actor_key)');
  if v_next = v_definition
     or pg_catalog.strpos(v_next,'on conflict (content_id, content_version, decided_by)') > 0
     or pg_catalog.strpos(v_next,'and a.decided_by = v_uid;') > 0 then
    raise exception 'could not safely rewrite record_content_decision actor semantics';
  end if;
  execute v_next;
end;
$rewrite_portal_decision$;

revoke all on function public.record_content_decision(uuid,int,text,text) from public,anon;
grant execute on function public.record_content_decision(uuid,int,text,text) to authenticated;

create table public.client_communications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  communication_key text not null,
  channel text not null check (channel in ('email','call','meeting')),
  occurred_at timestamptz not null,
  title text not null check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 300),
  summary text not null check (pg_catalog.char_length(pg_catalog.btrim(summary)) between 1 and 4000),
  actor_name text not null check (pg_catalog.char_length(pg_catalog.btrim(actor_name)) between 1 and 200),
  recorded_by_actor_id uuid not null references public.agency_actors(id),
  source_ref text not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id,client_id),
  unique (client_id,communication_key),
  check (communication_key ~ '^[a-z0-9][a-z0-9._:-]{1,199}$')
);
alter table public.client_communications enable row level security;
create policy client_communications_read on public.client_communications for select
  using (client_id in (select public.my_client_ids()));

create table public.portal_inbox_consumers (
  consumer_key text not null check (consumer_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
  client_id uuid not null references public.clients(id) on delete cascade,
  last_ack_seq bigint not null default 0 check (last_ack_seq >= 0),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (consumer_key,client_id)
);
alter table public.portal_inbox_consumers enable row level security;

-- Last-line database privacy gate for client-visible agency copy. The richer TypeScript gate runs
-- before the network call; this immutable subset prevents the most damaging raw-email/internal/PII
-- mistakes even if a service caller is buggy or bypasses the CLI.
create or replace function public.portal_client_summary_shape_valid(p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select p_text is not null
    and p_text !~* '<!--[[:space:]]*(internal|portal-block:)'
    and p_text !~* '(^|\n)[[:space:]]*(from|to|cc|bcc|sent|subject):[[:space:]]*.+'
    and p_text !~* '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}'
    and p_text !~* '\m(UCI|application[[:space:]]+(number|no\.)|file[[:space:]]+(number|no\.)|client[[:space:]]+id|account[[:space:]]+number)\M[[:space:]]*[:#\-]?[[:space:]]*[A-Z0-9][A-Z0-9 \-]{3,}'
    and p_text !~* '\m(invoice|quote|account|balance|amount[[:space:]]+due)\M[^\n]{0,50}(CAD[[:space:]]*)?\$[[:space:]]*[0-9]';
$$;
revoke all on function public.portal_client_summary_shape_valid(text) from public,anon,authenticated,service_role;

alter table public.client_communications add constraint client_communications_summary_safe
  check (public.portal_client_summary_shape_valid(title)
    and public.portal_client_summary_shape_valid(summary)
    and public.portal_client_summary_shape_valid(actor_name));
alter table public.recommendations add constraint recommendations_client_copy_safe
  check (public.portal_client_summary_shape_valid(title)
    and public.portal_client_summary_shape_valid(body));
alter table public.report_snapshots add constraint report_summary_safe
  check (summary is null or public.portal_client_summary_shape_valid(summary));

-- Internal shared side-effect writer. All object data remains on its canonical relation; payloads
-- deliberately contain only a reason and stable key, never private source/provenance.
create or replace function public.portal_emit_agency_surface_event(
  p_client_id uuid,p_event_key text,p_event_type text,p_object_type text,p_object_id uuid,
  p_object_key text,p_revision bigint,p_title text,p_summary text,p_actor_name text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_event_type is not null then
    insert into public.activity_log (
      client_id,event_type,event_key,title,summary,actor_type,actor_name
    ) values (p_client_id,p_event_type,p_event_key,p_title,p_summary,'anastasia',p_actor_name);
  end if;
  insert into public.portal_inbox_events (
    client_id,event_key,event_type,object_type,object_id,actor_type,actor_name,payload
  ) values (
    p_client_id,p_event_key,coalesce(p_event_type,p_object_type || '_updated'),p_object_type,
    p_object_id,'anastasia',p_actor_name,pg_catalog.jsonb_build_object('object_key',p_object_key)
  );
  insert into public.projection_outbox (
    client_id,event_key,destination,operation,object_type,object_key,object_revision,payload
  ) values (
    p_client_id,p_event_key,'notion','upsert',p_object_type,p_object_key,p_revision,
    pg_catalog.jsonb_build_object('reason',coalesce(p_event_type,p_object_type || '_updated'))
  );
end;
$$;

create or replace function public.upsert_portal_recommendation(
  p_client_id uuid,p_source_key text,p_title text,p_body text,p_category text,p_platform text,
  p_source_type text,p_source_ref text,p_provenance jsonb,p_status text,
  p_actor_key text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.agency_actors%rowtype; v_id uuid; v_revision bigint; v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype; v_event_key text;
begin
  select * into v_actor from public.agency_actors where actor_key=p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id=p_client_id) then raise exception 'client not found'; end if;
  if pg_catalog.btrim(p_title)='' or pg_catalog.char_length(p_title)>300
     or pg_catalog.btrim(p_body)='' or pg_catalog.char_length(p_body)>8000
     or pg_catalog.char_length(pg_catalog.btrim(p_source_ref)) not between 1 and 500
     or pg_catalog.octet_length(p_provenance::text)>10000
     or not public.portal_client_summary_shape_valid(p_title)
     or not public.portal_client_summary_shape_valid(p_body) then raise exception 'invalid recommendation copy'; end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('source_key',p_source_key,'title',p_title,'body',p_body,
      'category',p_category,'platform',p_platform,'source_type',p_source_type,
      'source_ref',p_source_ref,'provenance',p_provenance,'status',p_status)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id=p_client_id and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.command_type<>'upsert_recommendation' or v_receipt.request_fingerprint<>v_fingerprint
      then raise exception 'idempotency key reused with different request'; end if;
    return (v_receipt.response->>'id')::uuid;
  end if;
  insert into public.recommendations (
    client_id,source_key,title,body,category,platform,source_type,source_ref,provenance,status,revision
  ) values (
    p_client_id,p_source_key,pg_catalog.btrim(p_title),pg_catalog.btrim(p_body),p_category,
    nullif(pg_catalog.btrim(p_platform),''),p_source_type,pg_catalog.btrim(p_source_ref),
    p_provenance,p_status,1
  ) on conflict (client_id,source_key) do update set
    title=excluded.title,body=excluded.body,category=excluded.category,platform=excluded.platform,
    source_type=excluded.source_type,source_ref=excluded.source_ref,provenance=excluded.provenance,
    status=excluded.status,revision=recommendations.revision+1,updated_at=pg_catalog.now()
  returning id,revision into v_id,v_revision;
  v_event_key := 'agency:recommendation:' || p_idempotency_key;
  perform public.portal_emit_agency_surface_event(p_client_id,v_event_key,'recommendation_added',
    'recommendation',v_id,p_source_key,v_revision,'Strategy recommendation: '||pg_catalog.btrim(p_title),
    null,v_actor.display_name);
  insert into public.portal_command_receipts (client_id,command_type,idempotency_key,request_fingerprint,response)
    values (p_client_id,'upsert_recommendation',p_idempotency_key,v_fingerprint,
      pg_catalog.jsonb_build_object('id',v_id,'revision',v_revision));
  return v_id;
end;
$$;

create or replace function public.upsert_portal_link(
  p_client_id uuid,p_link_key text,p_category text,p_label text,p_url text,p_description text,
  p_sort int,p_source_type text,p_source_ref text,p_actor_key text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.agency_actors%rowtype; v_id uuid; v_revision bigint; v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype; v_event_key text;
begin
  select * into v_actor from public.agency_actors where actor_key=p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id=p_client_id) then raise exception 'client not found'; end if;
  if pg_catalog.btrim(p_label)='' or pg_catalog.char_length(p_label)>300
     or (p_description is not null and pg_catalog.char_length(p_description)>2000)
     or pg_catalog.char_length(pg_catalog.btrim(p_source_ref)) not between 1 and 500
     or p_sort not between 0 and 10000
     or not public.portal_client_link_url_valid(p_url) then raise exception 'invalid link'; end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('link_key',p_link_key,'category',p_category,'label',p_label,
      'url',p_url,'description',p_description,'sort',p_sort,'source_type',p_source_type,
      'source_ref',p_source_ref)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts where client_id=p_client_id and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.command_type<>'upsert_link' or v_receipt.request_fingerprint<>v_fingerprint
      then raise exception 'idempotency key reused with different request'; end if;
    return (v_receipt.response->>'id')::uuid;
  end if;
  insert into public.links (client_id,link_key,category,label,url,description,sort,source_type,source_ref,revision)
  values (p_client_id,p_link_key,p_category,pg_catalog.btrim(p_label),p_url,
    nullif(pg_catalog.btrim(p_description),''),p_sort,p_source_type,pg_catalog.btrim(p_source_ref),1)
  on conflict (client_id,link_key) do update set category=excluded.category,label=excluded.label,
    url=excluded.url,description=excluded.description,sort=excluded.sort,source_type=excluded.source_type,
    source_ref=excluded.source_ref,revision=links.revision+1,updated_at=pg_catalog.now()
  returning id,revision into v_id,v_revision;
  v_event_key := 'agency:link:' || p_idempotency_key;
  perform public.portal_emit_agency_surface_event(p_client_id,v_event_key,null,'link',v_id,p_link_key,
    v_revision,'Library link updated',null,v_actor.display_name);
  insert into public.portal_command_receipts (client_id,command_type,idempotency_key,request_fingerprint,response)
    values (p_client_id,'upsert_link',p_idempotency_key,v_fingerprint,
      pg_catalog.jsonb_build_object('id',v_id,'revision',v_revision));
  return v_id;
end;
$$;

create or replace function public.upsert_portal_report_snapshot(
  p_client_id uuid,p_period_start date,p_period_end date,p_platform text,p_schema_version int,
  p_metrics jsonb,p_summary text,p_collected_at timestamptz,p_source_type text,
  p_source_ref text,p_source_checksum text,p_actor_key text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.agency_actors%rowtype; v_id uuid; v_revision bigint; v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype; v_event_key text; v_period text;
begin
  select * into v_actor from public.agency_actors where actor_key=p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id=p_client_id) then raise exception 'client not found'; end if;
  if p_schema_version < 1 or p_period_end < p_period_start
     or not public.portal_report_metrics_valid(p_metrics,p_schema_version)
     or pg_catalog.octet_length(p_metrics::text)>100000
     or (p_summary is not null and pg_catalog.char_length(p_summary)>4000)
     or pg_catalog.char_length(pg_catalog.btrim(p_source_ref)) not between 1 and 500
     or p_source_checksum !~ '^[0-9a-f]{64}$'
     or (p_summary is not null and not public.portal_client_summary_shape_valid(p_summary))
    then raise exception 'invalid report snapshot'; end if;
  v_period := pg_catalog.to_char(p_period_start,'YYYY-MM-DD')||' to '||pg_catalog.to_char(p_period_end,'YYYY-MM-DD');
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('period_start',p_period_start,'period_end',p_period_end,
      'platform',p_platform,'schema_version',p_schema_version,'metrics',p_metrics,'summary',p_summary,
      'collected_at',p_collected_at,'source_type',p_source_type,'source_ref',p_source_ref,
      'source_checksum',p_source_checksum)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts where client_id=p_client_id and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.command_type<>'upsert_report' or v_receipt.request_fingerprint<>v_fingerprint
      then raise exception 'idempotency key reused with different request'; end if;
    return (v_receipt.response->>'id')::uuid;
  end if;
  insert into public.report_snapshots (
    client_id,period,period_start,period_end,platform,schema_version,metrics,summary,collected_at,
    source_type,source_ref,source_checksum,revision
  ) values (p_client_id,v_period,p_period_start,p_period_end,p_platform,p_schema_version,p_metrics,
    nullif(pg_catalog.btrim(p_summary),''),p_collected_at,p_source_type,pg_catalog.btrim(p_source_ref),
    p_source_checksum,1)
  on conflict (client_id,period_start,period_end,platform,schema_version) do update set
    period=excluded.period,metrics=excluded.metrics,summary=excluded.summary,collected_at=excluded.collected_at,
    source_type=excluded.source_type,source_ref=excluded.source_ref,source_checksum=excluded.source_checksum,
    revision=report_snapshots.revision+1,updated_at=pg_catalog.now()
  returning id,revision into v_id,v_revision;
  v_event_key := 'agency:report:' || p_idempotency_key;
  perform public.portal_emit_agency_surface_event(p_client_id,v_event_key,'monthly_report_added','report',
    v_id,p_platform||':'||p_period_start||':'||p_period_end||':v'||p_schema_version,v_revision,
    'New '||p_platform||' report',null,v_actor.display_name);
  insert into public.portal_command_receipts (client_id,command_type,idempotency_key,request_fingerprint,response)
    values (p_client_id,'upsert_report',p_idempotency_key,v_fingerprint,
      pg_catalog.jsonb_build_object('id',v_id,'revision',v_revision));
  return v_id;
end;
$$;

create or replace function public.log_portal_communication(
  p_client_id uuid,p_communication_key text,p_channel text,p_occurred_at timestamptz,
  p_title text,p_summary text,p_actor_name text,p_source_ref text,p_actor_key text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.agency_actors%rowtype; v_id uuid; v_revision bigint; v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype; v_event_key text;
begin
  select * into v_actor from public.agency_actors where actor_key=p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id=p_client_id) then raise exception 'client not found'; end if;
  if not public.portal_client_summary_shape_valid(p_title)
     or not public.portal_client_summary_shape_valid(p_summary)
     or not public.portal_client_summary_shape_valid(p_actor_name)
     or pg_catalog.char_length(pg_catalog.btrim(p_source_ref)) not between 1 and 500 then
    raise exception 'communication summary failed client-safety gate';
  end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('communication_key',p_communication_key,'channel',p_channel,
      'occurred_at',p_occurred_at,'title',p_title,'summary',p_summary,'actor_name',p_actor_name,
      'source_ref',p_source_ref)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts where client_id=p_client_id and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.command_type<>'log_communication' or v_receipt.request_fingerprint<>v_fingerprint
      then raise exception 'idempotency key reused with different request'; end if;
    return (v_receipt.response->>'id')::uuid;
  end if;
  insert into public.client_communications (client_id,communication_key,channel,occurred_at,title,
    summary,actor_name,recorded_by_actor_id,source_ref,revision)
  values (p_client_id,p_communication_key,p_channel,p_occurred_at,pg_catalog.btrim(p_title),
    pg_catalog.btrim(p_summary),pg_catalog.btrim(p_actor_name),v_actor.id,pg_catalog.btrim(p_source_ref),1)
  on conflict (client_id,communication_key) do update set channel=excluded.channel,
    occurred_at=excluded.occurred_at,title=excluded.title,summary=excluded.summary,
    actor_name=excluded.actor_name,recorded_by_actor_id=excluded.recorded_by_actor_id,
    source_ref=excluded.source_ref,revision=client_communications.revision+1,updated_at=pg_catalog.now()
  returning id,revision into v_id,v_revision;
  v_event_key := 'agency:communication:' || p_idempotency_key;
  perform public.portal_emit_agency_surface_event(p_client_id,v_event_key,'meeting_email_note_added',
    'communication',v_id,p_communication_key,v_revision,pg_catalog.btrim(p_title),
    pg_catalog.btrim(p_summary),v_actor.display_name);
  insert into public.portal_command_receipts (client_id,command_type,idempotency_key,request_fingerprint,response)
    values (p_client_id,'log_communication',p_idempotency_key,v_fingerprint,
      pg_catalog.jsonb_build_object('id',v_id,'revision',v_revision));
  return v_id;
end;
$$;

create or replace function public.record_external_decision(
  p_client_id uuid,p_content_id uuid,p_content_version int,p_contact_auth_user_id uuid,
  p_decision text,p_note text,p_decision_source text,p_source_occurred_at timestamptz,
  p_actor_key text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.agency_actors%rowtype; v_contact_name text; v_content public.content_items%rowtype;
  v_fingerprint text; v_receipt public.portal_command_receipts%rowtype; v_approval uuid;
  v_before_ids uuid[]; v_event_id uuid; v_event_key text; v_revision bigint;
  v_old_claims text; v_old_sub text;
begin
  select * into v_actor from public.agency_actors where actor_key=p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_decision_source not in ('email','call') then raise exception 'external decision source must be email or call'; end if;
  if p_source_occurred_at is null or p_source_occurred_at > pg_catalog.now()+interval '5 minutes'
    then raise exception 'invalid source occurrence time'; end if;
  if p_decision not in ('approved','change_requested') then raise exception 'invalid decision'; end if;
  if p_decision='change_requested' and nullif(pg_catalog.btrim(p_note),'') is null
    then raise exception 'change request note is required'; end if;
  if p_note is not null and (pg_catalog.char_length(p_note)>2000
      or not public.portal_client_summary_shape_valid(p_note)) then raise exception 'invalid client-visible note'; end if;
  select nullif(pg_catalog.btrim(cu.name),'') into v_contact_name from public.client_users cu
    where cu.client_id=p_client_id and cu.auth_user_id=p_contact_auth_user_id limit 1;
  if not found then raise exception 'contact is not a member of this client'; end if;
  if v_contact_name is null then raise exception 'contact needs a client-safe display name'; end if;
  select * into v_content from public.content_items ci
    where ci.id=p_content_id and ci.client_id=p_client_id for update;
  if not found then raise exception 'content does not belong to client'; end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('content_id',p_content_id,'content_version',p_content_version,
      'contact',p_contact_auth_user_id,'decision',p_decision,'note',p_note,
      'source',p_decision_source,'occurred_at',p_source_occurred_at)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id=p_client_id and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.command_type<>'record_external_decision' or v_receipt.request_fingerprint<>v_fingerprint
      then raise exception 'idempotency key reused with different request'; end if;
    return (v_receipt.response->>'id')::uuid;
  end if;

  select pg_catalog.array_agg(a.id) into v_before_ids from public.activity_log a
    where a.client_id=p_client_id and a.content_id=p_content_id
      and a.content_version=p_content_version and a.event_type in ('approved','change_requested');
  v_old_claims:=pg_catalog.current_setting('request.jwt.claims',true);
  v_old_sub:=pg_catalog.current_setting('request.jwt.claim.sub',true);
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub',p_contact_auth_user_id,'role','authenticated')::text,true);
  perform pg_catalog.set_config('request.jwt.claim.sub',p_contact_auth_user_id::text,true);
  v_approval:=public.record_content_decision(p_content_id,p_content_version,p_decision,p_note);
  perform pg_catalog.set_config('request.jwt.claims',coalesce(v_old_claims,''),true);
  perform pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_old_sub,''),true);

  update public.approvals set decided_by=null,decision_source=p_decision_source,
    decision_actor_key='auth:'||p_contact_auth_user_id::text,actor_name=v_contact_name,
    recorded_by=v_actor.id,source_occurred_at=p_source_occurred_at,idempotency_key=p_idempotency_key
  where id=v_approval;

  select a.id,a.event_key into v_event_id,v_event_key from public.activity_log a
    where a.client_id=p_client_id and a.content_id=p_content_id
      and a.content_version=p_content_version and a.event_type=p_decision
      and (v_before_ids is null or not (a.id=any(v_before_ids))) limit 1;
  if found then
    update public.activity_log set summary=case when nullif(pg_catalog.btrim(p_note),'') is null
      then v_contact_name||' decided by '||p_decision_source||'; recorded by '||v_actor.display_name||'.'
      else pg_catalog.btrim(p_note)||'; decided by '||p_decision_source||'; recorded by '||v_actor.display_name||'.' end
      where id=v_event_id;
    update public.portal_inbox_events set payload=payload||pg_catalog.jsonb_build_object(
      'decision_source',p_decision_source,'recorded_by',v_actor.actor_key,'source_occurred_at',p_source_occurred_at)
      where client_id=p_client_id and event_key=v_event_key;
  else
    update public.content_items set projection_revision=projection_revision+1,updated_at=pg_catalog.now()
      where id=p_content_id and client_id=p_client_id returning projection_revision into v_revision;
    v_event_key:='external-decision:'||p_idempotency_key;
    insert into public.activity_log (client_id,content_id,content_version,event_type,event_key,title,
      summary,actor_type,actor_name) values (p_client_id,p_content_id,p_content_version,p_decision,
      v_event_key,case when p_decision='approved' then 'Approved externally' else 'Change requested externally' end,
      case when nullif(pg_catalog.btrim(p_note),'') is null then
        v_contact_name||' decided by '||p_decision_source||'; recorded by '||v_actor.display_name||'.'
      else pg_catalog.btrim(p_note)||'; decided by '||p_decision_source||'; recorded by '||v_actor.display_name||'.' end,
      'client',v_contact_name);
    insert into public.portal_inbox_events (client_id,event_key,event_type,object_type,object_id,
      actor_type,actor_name,payload) values (p_client_id,v_event_key,p_decision,'content',p_content_id,
      'client',v_contact_name,pg_catalog.jsonb_build_object('content_version',p_content_version,
      'decision',p_decision,'decision_source',p_decision_source,'recorded_by',v_actor.actor_key,
      'source_occurred_at',p_source_occurred_at));
    insert into public.projection_outbox (client_id,event_key,destination,operation,object_type,
      object_key,object_revision,payload) values (p_client_id,v_event_key,'notion','upsert','content',
      p_content_id::text,v_revision,pg_catalog.jsonb_build_object('reason',p_decision,
      'content_version',p_content_version,'decision_source',p_decision_source));
  end if;
  insert into public.portal_command_receipts (client_id,command_type,idempotency_key,request_fingerprint,response)
    values (p_client_id,'record_external_decision',p_idempotency_key,v_fingerprint,
      pg_catalog.jsonb_build_object('id',v_approval));
  return v_approval;
end;
$$;

create or replace function public.read_portal_inbox(
  p_consumer_key text,p_client_id uuid,p_limit int default 100
) returns table(seq bigint,id uuid,event_type text,object_type text,object_id uuid,actor_type text,
  actor_name text,event_key text,payload jsonb,requires_reconciliation boolean,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_after bigint;
begin
  if not exists (select 1 from public.clients c where c.id=p_client_id) then raise exception 'client not found'; end if;
  insert into public.portal_inbox_consumers (consumer_key,client_id) values (p_consumer_key,p_client_id)
    on conflict (consumer_key,client_id) do nothing;
  select c.last_ack_seq into v_after from public.portal_inbox_consumers c
    where c.consumer_key=p_consumer_key and c.client_id=p_client_id;
  return query select e.seq,e.id,e.event_type,e.object_type,e.object_id,e.actor_type,e.actor_name,
    e.event_key,e.payload,e.requires_reconciliation,e.created_at from public.portal_inbox_events e
    where e.client_id=p_client_id and e.seq>v_after order by e.seq limit least(greatest(p_limit,1),500);
end;
$$;

create or replace function public.ack_portal_inbox(
  p_consumer_key text,p_client_id uuid,p_seq bigint
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_current bigint;
begin
  if not exists (select 1 from public.portal_inbox_events e where e.client_id=p_client_id and e.seq=p_seq)
    then raise exception 'event does not belong to client'; end if;
  if exists (select 1 from public.portal_inbox_events e where e.client_id=p_client_id and e.seq<=p_seq
    and e.requires_reconciliation) then raise exception 'reconciliation events cannot be cursor-acknowledged'; end if;
  update public.portal_inbox_consumers set last_ack_seq=greatest(last_ack_seq,p_seq),
    updated_at=pg_catalog.now() where consumer_key=p_consumer_key and client_id=p_client_id
    returning last_ack_seq into v_current;
  if not found then raise exception 'unknown inbox consumer'; end if;
  return v_current;
end;
$$;

create or replace function public.show_portal_inbox_event(p_client_id uuid,p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  select pg_catalog.to_jsonb(e) into v_result from public.portal_inbox_events e
    where e.client_id=p_client_id and (e.id=p_event_id or e.object_id=p_event_id)
    order by case when e.id=p_event_id then 0 else 1 end,e.seq desc limit 1;
  if v_result is null then raise exception 'inbox event not found for client'; end if;
  return v_result;
end;
$$;

create or replace function public.retry_portal_projections(p_client_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if not exists(select 1 from public.clients c where c.id=p_client_id) then raise exception 'client not found'; end if;
  update public.projection_outbox set status='pending',next_attempt_at=pg_catalog.now(),last_error=null
    where client_id=p_client_id and status='failed';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

-- Exact relation/function boundary.
revoke all on public.recommendations,public.links,public.report_snapshots,
  public.client_communications,public.portal_inbox_consumers,public.portal_client_link_hosts
  from public,anon,authenticated,service_role;
grant select (id,client_id,title,body,category,platform,status,created_at,updated_at)
  on public.recommendations to authenticated;
grant select (id,client_id,category,label,url,description,sort,created_at,updated_at)
  on public.links to authenticated;
grant select (id,client_id,period,period_start,period_end,platform,schema_version,metrics,summary,
  collected_at,created_at,updated_at) on public.report_snapshots to authenticated;
grant select (id,client_id,communication_key,channel,occurred_at,title,summary,actor_name,created_at,updated_at)
  on public.client_communications to authenticated;
grant select on public.recommendations,public.links,public.report_snapshots,public.client_communications
  to service_role;

revoke all on function public.portal_emit_agency_surface_event(uuid,text,text,text,uuid,text,bigint,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.upsert_portal_recommendation(uuid,text,text,text,text,text,text,text,jsonb,text,text,text)
  from public,anon,authenticated;
revoke all on function public.upsert_portal_link(uuid,text,text,text,text,text,int,text,text,text,text)
  from public,anon,authenticated;
revoke all on function public.upsert_portal_report_snapshot(uuid,date,date,text,int,jsonb,text,timestamptz,text,text,text,text,text)
  from public,anon,authenticated;
revoke all on function public.log_portal_communication(uuid,text,text,timestamptz,text,text,text,text,text,text)
  from public,anon,authenticated;
revoke all on function public.record_external_decision(uuid,uuid,int,uuid,text,text,text,timestamptz,text,text)
  from public,anon,authenticated;
revoke all on function public.read_portal_inbox(text,uuid,int) from public,anon,authenticated;
revoke all on function public.ack_portal_inbox(text,uuid,bigint) from public,anon,authenticated;
revoke all on function public.show_portal_inbox_event(uuid,uuid) from public,anon,authenticated;
revoke all on function public.retry_portal_projections(uuid) from public,anon,authenticated;
grant execute on function public.upsert_portal_recommendation(uuid,text,text,text,text,text,text,text,jsonb,text,text,text),
  public.upsert_portal_link(uuid,text,text,text,text,text,int,text,text,text,text),
  public.upsert_portal_report_snapshot(uuid,date,date,text,int,jsonb,text,timestamptz,text,text,text,text,text),
  public.log_portal_communication(uuid,text,text,timestamptz,text,text,text,text,text,text),
  public.record_external_decision(uuid,uuid,int,uuid,text,text,text,timestamptz,text,text),
  public.read_portal_inbox(text,uuid,int),public.ack_portal_inbox(text,uuid,bigint),
  public.show_portal_inbox_event(uuid,uuid),public.retry_portal_projections(uuid) to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_actual text[]; v_expected text[];
begin
  perform public.assert_portal_slice5_security();
  if exists (select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('recommendations','links','report_snapshots','client_communications','portal_inbox_consumers','portal_client_link_hosts')
    and tp.grantee in ('PUBLIC','anon')) then raise exception 'public/anon Slice 6 relation privilege'; end if;
  if exists (select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('recommendations','links','report_snapshots','client_communications')
    and tp.grantee in ('authenticated','service_role') and tp.privilege_type<>'SELECT')
    then raise exception 'direct Slice 6 relation write privilege'; end if;
  if exists (select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('portal_inbox_consumers','portal_client_link_hosts') and tp.grantee in ('authenticated','service_role'))
    then raise exception 'inbox consumer table is exposed'; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
    from information_schema.column_privileges cp where cp.table_schema='public'
      and cp.table_name='recommendations' and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  v_expected:=array['body','category','client_id','created_at','id','platform','status','title','updated_at'];
  if v_actual is distinct from v_expected then raise exception 'unsafe recommendation grants: %',v_actual; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
    from information_schema.column_privileges cp where cp.table_schema='public'
      and cp.table_name='links' and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  v_expected:=array['category','client_id','created_at','description','id','label','sort','updated_at','url'];
  if v_actual is distinct from v_expected then raise exception 'unsafe link grants: %',v_actual; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
    from information_schema.column_privileges cp where cp.table_schema='public'
      and cp.table_name='report_snapshots' and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  v_expected:=array['client_id','collected_at','created_at','id','metrics','period','period_end','period_start',
    'platform','schema_version','summary','updated_at'];
  if v_actual is distinct from v_expected then raise exception 'unsafe report grants: %',v_actual; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
    from information_schema.column_privileges cp where cp.table_schema='public'
      and cp.table_name='client_communications' and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  v_expected:=array['actor_name','channel','client_id','communication_key','created_at','id','occurred_at',
    'summary','title','updated_at'];
  if v_actual is distinct from v_expected then raise exception 'unsafe communication grants: %',v_actual; end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('upsert_portal_recommendation','upsert_portal_link',
      'upsert_portal_report_snapshot','log_portal_communication','record_external_decision',
      'read_portal_inbox','ack_portal_inbox','show_portal_inbox_event','retry_portal_projections')
      and (not p.prosecdef or not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""'])))
    then raise exception 'Slice 6 RPC is not hardened'; end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('upsert_portal_recommendation','upsert_portal_link',
      'upsert_portal_report_snapshot','log_portal_communication','record_external_decision',
      'read_portal_inbox','ack_portal_inbox','show_portal_inbox_event','retry_portal_projections')
      and (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
        or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')))
    then raise exception 'Slice 6 RPC exposed to browser roles'; end if;
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
