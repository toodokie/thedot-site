-- Keep the detailed audit trail in the portal, but reserve client email for moments
-- that need the client's attention. Internal progress, scheduling, publication, and
-- design-link activity remains available as in-app notification history.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_activity_notify()') is null
     or pg_catalog.to_regclass('public.notification_outbox') is null then
    raise exception '0062 requires the existing portal notification system';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice61_security;
revoke all on function public.assert_portal_slice61_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice61_security() to service_role;

create or replace function public.portal_client_activity_email_required(p_event_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_event_type in (
    'needs_review',
    'plan_cycle_submitted',
    'proposal_submitted',
    'proposal_revised',
    'invoice_issued',
    'request_replied',
    'proposal_message'
  )
$$;

create or replace function public.portal_activity_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_recipient text;
begin
  if new.event_type in ('comment_added','agency_comment_added','idea_comment_added','agency_idea_comment_added') then
    return new;
  end if;
  v_recipient := public.portal_notification_recipient(new.actor_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'activity', new.id,
    new.title, coalesce(new.summary,''), new.related_url);
  if v_recipient = 'agency'
     or (
       public.portal_feature_enabled(new.client_id, 'client_alerts')
       and public.portal_client_activity_email_required(new.event_type)
     ) then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  end if;
  return new;
end;
$$;

-- Do not deliver already-queued client status noise after this policy takes effect.
-- Direct comments and the attention-required activity types above are preserved.
update public.notification_outbox n
set status = 'abandoned',
    completed_at = pg_catalog.now(),
    next_attempt_at = null,
    last_error = 'Suppressed by quiet client email policy',
    claim_token = null,
    claimed_by = null,
    claim_expires_at = null
from public.activity_log a
where n.source_kind = 'activity'
  and n.source_activity_id = a.id
  and n.recipient_kind = 'client'
  and n.channel = 'email'
  and n.status in ('pending','failed')
  and not public.portal_client_activity_email_required(a.event_type);

revoke all on function public.portal_client_activity_email_required(text),
  public.portal_activity_notify()
  from public, anon, authenticated, service_role;
grant execute on function public.portal_client_activity_email_required(text) to service_role;

create function public.assert_portal_quiet_client_email_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef('public.portal_activity_notify()'::pg_catalog.regprocedure)
  into v_def;
  if v_def is null
     or v_def not ilike '%portal_client_activity_email_required(new.event_type)%'
     or v_def not ilike '%v_recipient = ''agency''%'
     or v_def not ilike '%portal_feature_enabled(new.client_id, ''client_alerts'')%' then
    raise exception 'quiet client activity email routing drifted';
  end if;
  if not public.portal_client_activity_email_required('needs_review')
     or not public.portal_client_activity_email_required('plan_cycle_submitted')
     or public.portal_client_activity_email_required('request_prepared')
     or public.portal_client_activity_email_required('request_applied')
     or public.portal_client_activity_email_required('design_link_updated')
     or public.portal_client_activity_email_required('publication_target_live') then
    raise exception 'quiet client activity email policy drifted';
  end if;
  if pg_catalog.has_function_privilege('anon','public.portal_client_activity_email_required(text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_client_activity_email_required(text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_client_activity_email_required(text)','EXECUTE') then
    raise exception 'quiet client email helper grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_quiet_client_email_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_quiet_client_email_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice61_security();
  perform public.assert_portal_quiet_client_email_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
