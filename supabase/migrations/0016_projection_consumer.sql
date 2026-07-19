-- Notion projection consumer: the durable drain for projection_outbox (produced since 0008, never
-- consumed). Adds tenant-scoped uniqueness + fencing to the outbox and the fenced service-role claim/
-- complete RPCs. One-way only; Notion is a projection target. The TS consumer + projectors load each
-- object's current client-safe state and write it out. No producer is changed.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.projection_outbox') is null
     or pg_catalog.to_regprocedure('public.portal_feature_enabled(uuid,text)') is null then
    raise exception '0015/base portal objects must exist before applying 0016';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice10_security;
revoke all on function public.assert_portal_slice10_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice10_security() to service_role;

-- ── outbox: tenant-scoped uniqueness + fencing columns (Codex review-2 #1/#2) ──
-- Both existing uniques omit client_id; the 0011 producer types use tenant-scoped text keys, so
-- collisions across tenants are possible. Drop both by their REAL catalog names (verified live), add
-- tenant-scoped equivalents, then assert the old ones are actually gone (a bad drop must not no-op).
-- Drop the pre-existing non-tenant-scoped uniques by their ACTUAL catalog names. Postgres
-- auto-generates + truncates those names, so hardcoding them is not portable across versions; find
-- any unique on projection_outbox that omits client_id (that is exactly the pre-0016 set) and drop it.
do $$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid = 'public.projection_outbox'::pg_catalog.regclass and c.contype = 'u'
      and not ((select a.attnum from pg_catalog.pg_attribute a
                where a.attrelid = c.conrelid and a.attname = 'client_id') = any(c.conkey))
  loop
    execute 'alter table public.projection_outbox drop constraint ' || pg_catalog.quote_ident(v_name);
  end loop;
end;
$$;
alter table public.projection_outbox
  add constraint projection_outbox_tenant_event_key_uniq
    unique (client_id, destination, event_key),
  add constraint projection_outbox_tenant_object_rev_uniq
    unique (client_id, destination, object_type, object_key, object_revision);
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.projection_outbox'::pg_catalog.regclass and c.contype = 'u'
      and not ((select a.attnum from pg_catalog.pg_attribute a
                where a.attrelid = c.conrelid and a.attname = 'client_id') = any(c.conkey))
  ) then
    raise exception 'a non-tenant-scoped projection_outbox unique remains';
  end if;
end;
$$;

create sequence if not exists public.projection_claim_token_seq;
alter table public.projection_outbox
  add column if not exists claim_token bigint,
  add column if not exists claimed_by text,
  add column if not exists claim_expires_at timestamptz;

-- at most one LIVE projection per key (hard backstop for serialization; expired leases don't count)
create unique index if not exists projection_outbox_one_processing_per_key
  on public.projection_outbox (client_id, destination, object_type, object_key)
  where status = 'processing';
create index if not exists projection_outbox_reclaim
  on public.projection_outbox (status, claim_expires_at) where status = 'processing';

-- ── fenced claim (service_role only) ─────────────────────────────────────────
-- Picks the NEWEST revision per key (so v1 can never overwrite v2), skips keys with a live
-- processing lease (expired leases are reclaimable, not a block: Codex review-2 edge), gates on the
-- fail-closed notion_projection switch, and returns last_succeeded_revision for the stale check.
create or replace function public.claim_projection_batch(p_worker text, p_limit int, p_claim_seconds int)
returns table (id uuid, client_id uuid, object_type text, object_key text, object_revision bigint,
  operation text, payload jsonb, claim_token bigint, last_succeeded_revision bigint)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with candidates as (
    select distinct on (o.client_id, o.object_type, o.object_key) o.id, o.created_at
    from public.projection_outbox o
    where o.destination = 'notion'
      and public.portal_feature_enabled(o.client_id, 'notion_projection')
      and (
        (o.status = 'pending' and (o.next_attempt_at is null or o.next_attempt_at <= pg_catalog.now()))
        or (o.status = 'processing' and o.claim_expires_at < pg_catalog.now())
      )
      and not exists (
        select 1 from public.projection_outbox p
        where p.client_id = o.client_id and p.destination = 'notion'
          and p.object_type = o.object_type and p.object_key = o.object_key
          and p.status = 'processing' and p.claim_expires_at >= pg_catalog.now()
      )
    -- Per key, RECLAIM an expired-processing row (the crashed in-flight attempt) before starting a new
    -- revision. Claiming a fresh pending row while an expired-processing row for the same key still
    -- exists would create two 'processing' rows and violate one_processing_per_key.
    order by o.client_id, o.object_type, o.object_key,
      (o.status = 'processing') desc,
      o.object_revision desc
  ),
  chosen as (
    select c.id from candidates c order by c.created_at limit p_limit
  )
  update public.projection_outbox n set
    status = 'processing',
    claim_token = pg_catalog.nextval('public.projection_claim_token_seq'::pg_catalog.regclass),
    claimed_by = p_worker,
    claim_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_claim_seconds),
    attempts = n.attempts + 1
  where n.id in (select chosen.id from chosen)
    and (
      (n.status = 'pending' and (n.next_attempt_at is null or n.next_attempt_at <= pg_catalog.now()))
      or (n.status = 'processing' and n.claim_expires_at < pg_catalog.now())
    )
  returning n.id, n.client_id, n.object_type, n.object_key, n.object_revision, n.operation, n.payload,
    n.claim_token,
    (select pg_catalog.max(s.object_revision) from public.projection_outbox s
      where s.client_id = n.client_id and s.destination = 'notion'
        and s.object_type = n.object_type and s.object_key = n.object_key
        and s.status = 'succeeded');
end;
$$;

create or replace function public.mark_projection_succeeded(p_id uuid, p_claim_token bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.projection_outbox set
    status = 'succeeded', completed_at = pg_catalog.now(),
    claim_token = null, claimed_by = null, claim_expires_at = null
  where id = p_id and claim_token = p_claim_token and status = 'processing';
end;
$$;

-- stale row (revision <= a succeeded revision for the key): terminal success, no Notion write.
create or replace function public.mark_projection_superseded(p_id uuid, p_claim_token bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.projection_outbox set
    status = 'succeeded', completed_at = pg_catalog.now(), last_error = 'superseded by newer revision',
    claim_token = null, claimed_by = null, claim_expires_at = null
  where id = p_id and claim_token = p_claim_token and status = 'processing';
end;
$$;

create or replace function public.mark_projection_failed(p_id uuid, p_claim_token bigint, p_error text, p_max_attempts int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.projection_outbox n set
    status = case when n.attempts >= p_max_attempts then 'abandoned' else 'pending' end,
    last_error = p_error,
    next_attempt_at = case when n.attempts >= p_max_attempts then null
      else pg_catalog.now() + pg_catalog.make_interval(
        secs => least(3600, (30 * pg_catalog.power(2, n.attempts))::int)) end,
    claim_token = null, claimed_by = null, claim_expires_at = null
  where n.id = p_id and n.claim_token = p_claim_token and n.status = 'processing';
end;
$$;

-- force a full re-project of an object's current revision (drift repair)
create or replace function public.enqueue_projection_reconcile(p_client_id uuid, p_object_type text, p_object_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_rev bigint;
begin
  select pg_catalog.max(o.object_revision) into v_rev from public.projection_outbox o
    where o.client_id = p_client_id and o.destination = 'notion'
      and o.object_type = p_object_type and o.object_key = p_object_key;
  if v_rev is null then return; end if;
  insert into public.projection_outbox (client_id, event_key, destination, operation, object_type,
    object_key, object_revision, payload)
  values (p_client_id, 'reconcile:' || p_object_type || ':' || p_object_key || ':' || v_rev::text,
    'notion', 'reconcile', p_object_type, p_object_key, v_rev,
    pg_catalog.jsonb_build_object('reason','manual_reconcile'))
  on conflict (client_id, destination, event_key) do nothing;
end;
$$;

-- ── grants (service_role only; no client access to the projection plane) ─────
revoke all on function
  public.claim_projection_batch(text,int,int),
  public.mark_projection_succeeded(uuid,bigint),
  public.mark_projection_superseded(uuid,bigint),
  public.mark_projection_failed(uuid,bigint,text,int),
  public.enqueue_projection_reconcile(uuid,text,text)
  from public,anon,authenticated;
grant execute on function
  public.claim_projection_batch(text,int,int),
  public.mark_projection_succeeded(uuid,bigint),
  public.mark_projection_superseded(uuid,bigint),
  public.mark_projection_failed(uuid,bigint,text,int),
  public.enqueue_projection_reconcile(uuid,text,text)
  to service_role;

-- ── in-migration security assertion ──────────────────────────────────────────
create or replace function public.assert_portal_projection_consumer_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  -- every unique on projection_outbox must be tenant-scoped (include client_id): the pre-0016
  -- non-tenant-scoped uniques must be gone, checked by column set rather than fragile auto-names.
  if exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.projection_outbox'::pg_catalog.regclass and c.contype='u'
      and not ((select a.attnum from pg_catalog.pg_attribute a
                where a.attrelid=c.conrelid and a.attname='client_id') = any(c.conkey))
  ) then raise exception 'non-tenant-scoped projection_outbox unique present'; end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid='public.projection_outbox'::pg_catalog.regclass
      and conname='projection_outbox_tenant_event_key_uniq')
     or not exists (select 1 from pg_catalog.pg_constraint
    where conrelid='public.projection_outbox'::pg_catalog.regclass
      and conname='projection_outbox_tenant_object_rev_uniq') then
    raise exception 'tenant-scoped projection_outbox unique missing'; end if;
  -- one-live-processing-per-key backstop present
  if not exists (select 1 from pg_catalog.pg_class where relname='projection_outbox_one_processing_per_key'
    and relkind='i') then raise exception 'one-processing-per-key index missing'; end if;
  -- consumer functions hardened
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('claim_projection_batch','mark_projection_succeeded',
      'mark_projection_superseded','mark_projection_failed','enqueue_projection_reconcile')
      and (not p.prosecdef or not(coalesce(p.proconfig,'{}'::text[])@>array['search_path=""']))) then
    raise exception 'projection consumer function is not hardened'; end if;
  -- service-role only; never client/anon
  if pg_catalog.has_function_privilege('authenticated','public.claim_projection_batch(text,integer,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.claim_projection_batch(text,integer,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.mark_projection_succeeded(uuid,bigint)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.enqueue_projection_reconcile(uuid,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.claim_projection_batch(text,integer,integer)','EXECUTE') then
    raise exception 'unsafe projection consumer privilege'; end if;
end;
$$;
revoke all on function public.assert_portal_projection_consumer_security() from public,anon,authenticated;
grant execute on function public.assert_portal_projection_consumer_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice10_security();
  perform public.assert_portal_projection_consumer_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
