-- Make weekly plan notifications actionable and quiet.
--
-- A first submission gets one linked email with a scannable day list. Internal
-- resubmissions stay in-app unless the immediately preceding revision received a
-- client decision. Undecided submitted cycles close automatically after week_end.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_activity_notify()') is null
     or pg_catalog.to_regprocedure('public.claim_notification_batch(text,integer,integer)') is null
     or pg_catalog.to_regclass('public.plan_cycles') is null
     or pg_catalog.to_regclass('public.plan_cycle_items') is null
     or pg_catalog.to_regclass('public.plan_cycle_decisions') is null then
    raise exception '0083 requires plan cycles and durable notifications';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice82_security;
revoke all on function public.assert_portal_slice82_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice82_security() to service_role;

create function public.portal_plan_cycle_email_body(p_plan_cycle_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cycle public.plan_cycles%rowtype;
  v_items text;
  v_deadline date;
  v_deadline_label text;
  v_today date := (pg_catalog.now() at time zone 'America/Toronto')::date;
  v_ask text;
begin
  select * into v_cycle
  from public.plan_cycles c
  where c.id = p_plan_cycle_id;
  if not found then
    return null;
  end if;

  select pg_catalog.string_agg(
    case
      when i.planned_date is null then 'Date to confirm'
      else (array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[pg_catalog.date_part('isodow', i.planned_date)::int]
        || ' ' || pg_catalog.to_char(i.planned_date, 'Mon FMDD')
    end
      || ': ' || i.title
      || case when pg_catalog.cardinality(i.platforms) > 0
        then ' (' || pg_catalog.array_to_string(i.platforms, ', ') || ')'
        else '' end,
    E'\n' order by i.planned_date nulls last, i.position
  ) into v_items
  from public.plan_cycle_items i
  where i.plan_cycle_id = v_cycle.id;

  v_deadline := v_cycle.week_start - 3;
  v_deadline_label := (array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[
    pg_catalog.date_part('isodow', v_deadline)::int
  ] || ' ' || pg_catalog.to_char(v_deadline, 'Mon FMDD');
  v_ask := case
    when v_deadline >= v_today then
      'Please review the direction in the portal and send any changes by ' || v_deadline_label
        || '. Each piece will still come to you for approval before it posts.'
    else
      'Please send any changes as soon as possible. Each piece will still come to you for approval before it posts.'
  end;

  return coalesce(v_items || E'\n\n', '')
    || v_cycle.direction_summary || E'\n\n' || v_ask;
end;
$$;

create function public.portal_plan_cycle_submission_should_email(
  p_client_id uuid,
  p_event_key text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cycle_key text;
  v_revision int;
  v_cycle_id uuid;
begin
  if p_event_key !~ '^agency:plan-cycle:.+:[0-9]+$' then
    return true;
  end if;
  v_cycle_key := pg_catalog.btrim(
    pg_catalog.substring(p_event_key from '^agency:plan-cycle:(.*):[0-9]+$')
  );
  v_revision := pg_catalog.substring(p_event_key from ':([0-9]+)$')::int;

  select c.id into v_cycle_id
  from public.plan_cycles c
  where c.client_id = p_client_id and c.cycle_key = v_cycle_key;
  if v_cycle_id is null then
    return true;
  end if;
  if v_revision = 1 then
    return true;
  end if;

  return exists (
    select 1
    from public.plan_cycle_decisions d
    where d.plan_cycle_id = v_cycle_id
      and d.client_id = p_client_id
      and d.revision = v_revision - 1
  );
end;
$$;

create function public.portal_enrich_plan_cycle_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle_key text;
  v_cycle_id uuid;
  v_client_slug text;
  v_body text;
begin
  if new.event_type <> 'plan_cycle_submitted'
     or new.event_key !~ '^agency:plan-cycle:.+:[0-9]+$' then
    return new;
  end if;

  v_cycle_key := pg_catalog.btrim(
    pg_catalog.substring(new.event_key from '^agency:plan-cycle:(.*):[0-9]+$')
  );
  select c.id, cl.slug into v_cycle_id, v_client_slug
  from public.plan_cycles c
  join public.clients cl on cl.id = c.client_id
  where c.client_id = new.client_id and c.cycle_key = v_cycle_key;
  if v_cycle_id is null or v_client_slug is null then
    return new;
  end if;

  v_body := public.portal_plan_cycle_email_body(v_cycle_id);
  if v_body is not null then
    new.summary := v_body;
  end if;
  new.related_url := 'https://www.thedotcreative.co/client/' || v_client_slug
    || '/plan#plan-cycle-' || v_cycle_id::text;
  return new;
end;
$$;

drop trigger if exists portal_plan_cycle_submission_enrich_bin on public.activity_log;
create trigger portal_plan_cycle_submission_enrich_bin
  before insert on public.activity_log
  for each row execute function public.portal_enrich_plan_cycle_submission();

create or replace function public.portal_activity_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text;
  v_block_key text;
  v_target_label text;
begin
  if new.event_type in ('comment_added','agency_comment_added','idea_comment_added','agency_idea_comment_added') then
    return new;
  end if;
  v_recipient := public.portal_notification_recipient(new.actor_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'activity', new.id,
    new.title, coalesce(new.summary,''), new.related_url);

  if v_recipient = 'agency' and new.event_type = 'edit_requested' and new.content_id is not null then
    select r.payload->>'block_key' into v_block_key
    from public.content_change_requests r
    where r.client_id = new.client_id
      and 'content-request:' || r.id::text = new.event_key;
    select e.value->>'label' into v_target_label
    from public.content_item_versions cv
    cross join lateral pg_catalog.jsonb_array_elements(cv.copy_blocks) e(value)
    where cv.content_item_id = new.content_id
      and cv.client_id = new.client_id
      and cv.version = new.content_version
      and e.value->>'key' = v_block_key;
    perform public.portal_enqueue_agency_piece_digest(
      new.client_id, new.content_id, 'activity', new.id, new.actor_name, 'edit',
      coalesce(v_target_label, pg_catalog.initcap(pg_catalog.replace(v_block_key, '-', ' ')), 'Copy')
    );
  elsif v_recipient = 'agency' then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  elsif public.portal_feature_enabled(new.client_id, 'client_alerts')
     and public.portal_client_activity_email_required(new.event_type)
     and (
       new.event_type <> 'plan_cycle_submitted'
       or public.portal_plan_cycle_submission_should_email(new.client_id, new.event_key)
     ) then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  end if;
  return new;
end;
$$;

create function public.portal_close_expired_plan_cycles()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed int := 0;
begin
  -- Closing an expired heads-up is housekeeping, not a new client-facing event.
  -- Preserve the cycle and its revision history while keeping Maria's inbox quiet.
  update public.plan_cycles c
  set status = 'closed', updated_at = pg_catalog.now()
  where c.status = 'submitted'
    and c.week_end < (pg_catalog.now() at time zone 'America/Toronto')::date;
  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

create or replace function public.claim_notification_batch(
  p_worker text,
  p_limit int,
  p_claim_seconds int
) returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid p_limit';
  end if;
  if p_claim_seconds is null or p_claim_seconds < 1 or p_claim_seconds > 3600 then
    raise exception 'invalid p_claim_seconds';
  end if;

  perform public.portal_close_expired_plan_cycles();

  return query
  update public.notification_outbox n set
    status = 'processing',
    claim_token = pg_catalog.nextval('public.notification_claim_token_seq'::pg_catalog.regclass),
    claimed_by = p_worker,
    claim_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_claim_seconds),
    attempts = n.attempts + 1
  where n.id in (
    select c.id from public.notification_outbox c
    where c.channel = 'email'
      and (
        (c.status = 'pending' and (c.next_attempt_at is null or c.next_attempt_at <= pg_catalog.now()))
        or (c.status = 'processing' and c.claim_expires_at < pg_catalog.now())
      )
    order by c.created_at
    limit p_limit
    for update skip locked
  )
  returning n.*;
end;
$$;

revoke all on function public.portal_plan_cycle_email_body(uuid),
  public.portal_plan_cycle_submission_should_email(uuid,text),
  public.portal_enrich_plan_cycle_submission(),
  public.portal_close_expired_plan_cycles(),
  public.portal_activity_notify(),
  public.claim_notification_batch(text,int,int)
  from public, anon, authenticated, service_role;
grant execute on function public.portal_plan_cycle_email_body(uuid),
  public.portal_plan_cycle_submission_should_email(uuid,text),
  public.portal_close_expired_plan_cycles(),
  public.claim_notification_batch(text,int,int)
  to service_role;

create function public.assert_portal_plan_cycle_email_reliability()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrich_def text;
  v_notify_def text;
  v_claim_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_enrich_plan_cycle_submission()'::pg_catalog.regprocedure
  ) into v_enrich_def;
  select pg_catalog.pg_get_functiondef(
    'public.portal_activity_notify()'::pg_catalog.regprocedure
  ) into v_notify_def;
  select pg_catalog.pg_get_functiondef(
    'public.claim_notification_batch(text,integer,integer)'::pg_catalog.regprocedure
  ) into v_claim_def;

  if v_enrich_def is null
     or v_enrich_def not ilike '%/plan#plan-cycle-%'
     or v_enrich_def not ilike '%portal_plan_cycle_email_body%'
     or v_notify_def is null
     or v_notify_def not ilike '%portal_plan_cycle_submission_should_email%'
     or v_notify_def not ilike '%portal_enqueue_agency_piece_digest%'
     or v_claim_def is null
     or v_claim_def not ilike '%portal_close_expired_plan_cycles%' then
    raise exception 'plan-cycle notification reliability drifted';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.activity_log'::pg_catalog.regclass
      and t.tgname = 'portal_plan_cycle_submission_enrich_bin'
      and not t.tgisinternal
  ) then
    raise exception 'plan-cycle submission enrichment trigger is missing';
  end if;

  if pg_catalog.has_function_privilege('anon','public.portal_close_expired_plan_cycles()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_close_expired_plan_cycles()','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_close_expired_plan_cycles()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_plan_cycle_email_body(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_plan_cycle_submission_should_email(uuid,text)','EXECUTE') then
    raise exception 'plan-cycle reliability helper grants are unsafe';
  end if;
end;
$$;

revoke all on function public.assert_portal_plan_cycle_email_reliability()
  from public, anon, authenticated;
grant execute on function public.assert_portal_plan_cycle_email_reliability()
  to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice82_security();
  perform public.assert_portal_plan_cycle_email_reliability();
end;
$$;

revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.portal_close_expired_plan_cycles();
select public.assert_portal_security();

commit;
