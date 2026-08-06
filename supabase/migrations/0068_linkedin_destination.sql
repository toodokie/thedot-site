-- LinkedIn is a first-class publication destination. A LinkedIn adaptation remains
-- its own content identity, while website articles continue to use the independent
-- Squarespace destination. This migration widens only destination vocabularies and
-- their guarded writers. It does not create content, approvals, or publication claims.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_schedule_destination(text)') is null
     or pg_catalog.to_regprocedure('public.portal_provider_url_valid(text,text,text)') is null
     or pg_catalog.to_regprocedure('public.request_content_create(uuid,text,text,text[],date,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)') is null then
    raise exception '0068 requires the existing scheduling, publication, request, and override boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice67_security;
revoke all on function public.assert_portal_slice67_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice67_security() to service_role;

alter table public.content_schedule_targets
  drop constraint if exists content_schedule_targets_destination_check;
alter table public.content_schedule_targets
  add constraint content_schedule_targets_destination_check
  check (destination in ('instagram','facebook','youtube','linkedin','squarespace','other'));

alter table public.content_schedule_request_attempts
  drop constraint if exists content_schedule_request_attempts_destination_check;
alter table public.content_schedule_request_attempts
  add constraint content_schedule_request_attempts_destination_check
  check (destination in ('instagram','facebook','youtube','linkedin','squarespace','other'));

alter table public.content_publication_targets
  drop constraint if exists content_publication_targets_destination_check;
alter table public.content_publication_targets
  add constraint content_publication_targets_destination_check
  check (destination in ('instagram','facebook','youtube','linkedin','squarespace','other'));

alter table public.historical_publication_import_entries
  drop constraint if exists historical_publication_import_entries_destination_check;
alter table public.historical_publication_import_entries
  add constraint historical_publication_import_entries_destination_check
  check (destination in ('instagram','facebook','youtube','linkedin','squarespace','other'));

alter table public.content_production_gates
  drop constraint if exists content_production_gates_dest_check;
alter table public.content_production_gates
  add constraint content_production_gates_dest_check
  check (dest in ('instagram','facebook','youtube','linkedin','squarespace'));

alter table public.production_gate_events
  drop constraint if exists production_gate_events_dest_check;
alter table public.production_gate_events
  add constraint production_gate_events_dest_check
  check (dest in ('instagram','facebook','youtube','linkedin','squarespace'));

alter table public.report_snapshots
  drop constraint if exists report_snapshots_platform_check;
alter table public.report_snapshots
  add constraint report_snapshots_platform_check
  check (platform in ('instagram','facebook','youtube','linkedin','website'));

create or replace function public.portal_schedule_destination(p_platform text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.lower(pg_catalog.btrim(p_platform))
    when 'instagram' then 'instagram'
    when 'facebook' then 'facebook'
    when 'youtube' then 'youtube'
    when 'youtube shorts' then 'youtube'
    when 'youtube_shorts' then 'youtube'
    when 'youtube-shorts' then 'youtube'
    when 'linkedin' then 'linkedin'
    when 'linked in' then 'linkedin'
    when 'squarespace' then 'squarespace'
    when 'website' then 'squarespace'
    when 'blog' then 'squarespace'
    when 'other' then 'other'
    else null
  end
$$;
revoke all on function public.portal_schedule_destination(text)
  from public, anon, authenticated, service_role;

create or replace function public.portal_provider_url_valid(
  p_destination text, p_url text, p_purpose text
) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v_authority text;
  v_host text;
begin
  if p_destination not in ('instagram','facebook','youtube','linkedin','squarespace','other')
     or p_purpose not in ('schedule','live') or p_url is null
     or pg_catalog.char_length(p_url) not between 1 and 2048
     or p_url !~ '^https://[^[:space:][:cntrl:]]+$'
     or p_url ~ '^https://[^/?#]*@' then return false; end if;
  v_authority := pg_catalog.substring(p_url, '^https://([^/?#]+)');
  if v_authority is null or v_authority ~ '@' then return false; end if;
  v_host := pg_catalog.lower(pg_catalog.rtrim(
    pg_catalog.regexp_replace(v_authority, ':[0-9]+$', ''), '.'
  ));
  if p_destination = 'instagram' then
    return v_host in ('instagram.com','www.instagram.com')
      or (p_purpose = 'schedule' and v_host in ('facebook.com','www.facebook.com','business.facebook.com'));
  elsif p_destination = 'facebook' then
    return v_host in ('facebook.com','www.facebook.com','business.facebook.com','fb.watch');
  elsif p_destination = 'youtube' then
    return v_host in ('youtube.com','www.youtube.com','studio.youtube.com','youtu.be');
  elsif p_destination = 'linkedin' then
    return v_host in ('linkedin.com','www.linkedin.com');
  elsif p_destination = 'squarespace' then
    return v_host = 'kanset.com' or v_host like '%.kanset.com';
  else
    return v_host in ('linkedin.com','www.linkedin.com');
  end if;
end;
$$;
revoke all on function public.portal_provider_url_valid(text,text,text)
  from public, anon, authenticated, service_role;

-- Preserve the reviewed function bodies and grants while widening their explicit
-- allowlists. Abort if a prior migration changed the expected text.
do $rewrite$
declare
  v_def text;
  v_old text := $old$('instagram','facebook','youtube','squarespace','other')$old$;
  v_new text := $new$('instagram','facebook','youtube','linkedin','squarespace','other')$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_content_request_payload_valid(text,jsonb)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'content-request payload destination allowlist drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);

  select pg_catalog.pg_get_functiondef(
    'public.request_content_create(uuid,text,text,text[],date,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'content-create destination allowlist drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);

  select pg_catalog.pg_get_functiondef(
    'public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  v_old := $old$('instagram','facebook','youtube','squarespace')$old$;
  v_new := $new$('instagram','facebook','youtube','linkedin','squarespace')$new$;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'agency override destination allowlist drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;

revoke all on function public.portal_content_request_payload_valid(text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.request_content_create(uuid,text,text,text[],date,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_content_create(uuid,text,text,text[],date,text,uuid)
  to authenticated;
revoke all on function public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)
  to service_role;

create function public.assert_portal_linkedin_destination_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
begin
  if public.portal_schedule_destination('LinkedIn') is distinct from 'linkedin'
     or public.portal_schedule_destination('website') is distinct from 'squarespace'
     or not public.portal_provider_url_valid('linkedin','https://www.linkedin.com/company/kanset-services','live')
     or public.portal_provider_url_valid('linkedin','https://example.com/not-linkedin','live') then
    raise exception 'LinkedIn destination mapping or URL boundary is invalid';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.content_schedule_targets'::pg_catalog.regclass
      and c.conname = 'content_schedule_targets_destination_check'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%linkedin%'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.content_publication_targets'::pg_catalog.regclass
      and c.conname = 'content_publication_targets_destination_check'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%linkedin%'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.report_snapshots'::pg_catalog.regclass
      and c.conname = 'report_snapshots_platform_check'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%linkedin%'
  ) then
    raise exception 'LinkedIn destination constraints are incomplete';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.request_content_create(uuid,text,text,text[],date,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def not ilike '%linkedin%'
     or not exists (
       select 1 from pg_catalog.pg_proc p
       where p.oid = 'public.request_content_create(uuid,text,text,text[],date,text,uuid)'::pg_catalog.regprocedure
         and p.prosecdef and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
     )
     or pg_catalog.has_function_privilege('anon','public.request_content_create(uuid,text,text,text[],date,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.request_content_create(uuid,text,text,text[],date,text,uuid)','EXECUTE') then
    raise exception 'LinkedIn client-request writer is not safely exposed';
  end if;

  if pg_catalog.has_function_privilege('anon','public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)','EXECUTE') then
    raise exception 'LinkedIn override writer privileges are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_linkedin_destination_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_linkedin_destination_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice67_security();
  perform public.assert_portal_linkedin_destination_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
