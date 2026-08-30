-- Client-directed agency comments need a direct client-piece URL. Previously the comment
-- notification only generated a link for agency recipients, so a client received an email
-- preview without a usable portal button.

begin;

create or replace function public.portal_comment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text;
  v_content_key text;
  v_client_slug text;
  v_related_url text;
begin
  v_recipient := public.portal_notification_recipient(new.author_type);
  select ci.content_id, c.slug into v_content_key, v_client_slug
  from public.content_items ci
  join public.clients c on c.id = ci.client_id
  where ci.id = new.content_id and ci.client_id = new.client_id;

  if v_content_key is not null then
    if v_recipient = 'agency' then
      v_related_url := 'https://www.thedotcreative.co/admin/portal/pieces/' || v_content_key;
    elsif v_recipient = 'client' and v_client_slug is not null then
      v_related_url := 'https://www.thedotcreative.co/client/' || v_client_slug || '/piece/' || v_content_key;
    end if;
  end if;

  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'comment', new.id,
    new.author_name || ' commented', pg_catalog.left(new.body, 280), v_related_url);
  if v_recipient = 'agency' then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'comment', new.id,
      new.author_name || ' commented', pg_catalog.left(new.body, 280), v_related_url);
  elsif public.portal_feature_enabled(new.client_id, 'client_alerts') then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'comment', new.id,
      new.author_name || ' commented', pg_catalog.left(new.body, 280), v_related_url);
  end if;
  return new;
end;
$$;

select public.assert_portal_security();

commit;
