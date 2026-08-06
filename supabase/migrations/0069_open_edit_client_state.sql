-- An unresolved client edit is work owned by The Dot, even before the agency opens
-- a canonical revision. Reflect that durable request state in every consumer of the
-- released client projection instead of leaving the piece in "needs review."

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_with_state') is null
     or pg_catalog.to_regclass('public.content_change_requests') is null then
    raise exception '0069 requires the released content and content-request boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice68_security;
revoke all on function public.assert_portal_slice68_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice68_security() to service_role;

create or replace view public.content_with_state
with (security_invoker = true)
as
select
  ci.id,ci.content_id,ci.client_id,v.title,v.format,v.pillar,v.platforms,ci.status,
  ci.planned_date,schedule.schedule_state,publication.publication_state,
  coalesce(dl.canva_url, v.canva_url) as canva_url,
  coalesce(dl.drive_url, v.drive_url) as drive_url,
  v.version,v.fact_check,v.fact_check_scope,
  v.fact_check_exemption,v.fact_check_ledger,v.client_body,v.copy_blocks,
  v.synced_at as updated_at,ci.review_ready_at,ci.revision_in_progress,ci.archived_at,
  decision.state as current_decision,
  case
    when ci.archived_at is not null then 'archived'
    when publication.publication_state = 'live' then 'live'
    when schedule.schedule_state = 'cancel_pending' then 'cancel_pending'
    when decision.state = 'change_requested'
      or ci.revision_in_progress
      or coalesce(open_edit.exists_for_item, false) then 'with_dot'
    when publication.publication_state = 'partially_live' then 'partially_live'
    when publication.publication_state = 'failed' then 'publish_failed'
    when schedule.schedule_state = 'reschedule_pending' then 'reschedule_pending'
    when schedule.schedule_state = 'failed' then 'schedule_failed'
    when schedule.schedule_state = 'partially_scheduled' then 'partially_scheduled'
    when schedule.schedule_state = 'scheduled' then 'scheduled'
    when ci.status = 'approved' then 'approved'
    when ci.status = 'draft' and ci.review_ready_at is not null then 'needs_review'
    else 'with_dot'
  end::text as client_state
from public.content_items ci
join public.content_item_versions v on v.content_item_id = ci.id
  and v.client_id = ci.client_id and v.version = ci.client_visible_version
left join public.content_design_links dl on dl.content_item_id = ci.id
  and dl.client_id = ci.client_id
cross join lateral (select public.portal_content_schedule_state(
  ci.id,ci.client_visible_version) as schedule_state) schedule
cross join lateral (select public.portal_publication_state(
  ci.id,ci.client_visible_version) as publication_state) publication
left join lateral (
  select a.state from public.approvals a where a.content_id = ci.id
    and a.client_id = ci.client_id and a.content_version = ci.client_visible_version
  order by a.created_at desc,a.id desc limit 1
) decision on true
left join lateral (
  select true as exists_for_item
  from public.content_change_requests r
  where r.client_id = ci.client_id
    and r.content_id = ci.id
    and r.request_type = 'edit'
    and r.status in ('pending','applying','prepared')
  limit 1
) open_edit on true;

revoke all on public.content_with_state from public, anon, authenticated, service_role;
grant select on public.content_with_state to authenticated, service_role;

create function public.assert_portal_open_edit_projection_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
  v_columns text[];
  v_expected text[] := array[
    'id','content_id','client_id','title','format','pillar','platforms','status',
    'planned_date','schedule_state','publication_state','canva_url','drive_url','version',
    'fact_check','fact_check_scope','fact_check_exemption','fact_check_ledger','client_body',
    'copy_blocks','updated_at','review_ready_at','revision_in_progress','archived_at',
    'current_decision','client_state'
  ];
begin
  select pg_catalog.pg_get_viewdef('public.content_with_state'::pg_catalog.regclass, true)
  into v_def;
  if v_def is null
     or v_def not ilike '%content_change_requests%'
     or v_def not ilike '%request_type%edit%'
     or v_def not ilike '%pending%applying%prepared%'
     or v_def not ilike '%with_dot%' then
    raise exception 'content_with_state does not project unresolved client edits';
  end if;

  select pg_catalog.array_agg(a.attname::text order by a.attnum)
  into v_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.content_with_state'::pg_catalog.regclass
    and a.attnum > 0 and not a.attisdropped;
  if v_columns is distinct from v_expected then
    raise exception 'content_with_state columns changed unexpectedly: %', v_columns;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'public.content_with_state'::pg_catalog.regclass
      and coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'content_with_state must remain security_invoker';
  end if;

  if exists (
       select 1 from information_schema.table_privileges p
       where p.table_schema = 'public' and p.table_name = 'content_with_state'
         and p.grantee = 'PUBLIC' and p.privilege_type = 'SELECT'
     )
     or pg_catalog.has_table_privilege('anon','public.content_with_state','SELECT')
     or not pg_catalog.has_table_privilege('authenticated','public.content_with_state','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.content_with_state','SELECT') then
    raise exception 'content_with_state grants are unsafe';
  end if;
end;
$$;

revoke all on function public.assert_portal_open_edit_projection_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_open_edit_projection_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice68_security();
  perform public.assert_portal_open_edit_projection_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
