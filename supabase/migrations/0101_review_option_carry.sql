-- 0101: carry review-asset option groups (0098) when a new version copies the previous version's
-- review assets. Both copy paths (the copy-only sync in portal_core_evaluate_content_item_version,
-- 0092, and the video revision in begin_visual_request_revision, 0099) list the asset columns by
-- name and predate 0098, so the copy dropped option_group and option_label: on 2026-10-08 the
-- Ep4 trailer's v2 (Maria's caption edit applied) lost its teal/rust pick group. This rewrites the
-- one insert-select in each function in place (the 0092 pattern: exact text, asserted once),
-- repairs rows already copied without their group, and chains a security assertion.
begin;

do $rewrite$
declare
  v_fn text;
  v_def text;
  v_old_cols text := $c$caption_status,review_note)
  select a.client_id,a.content_item_id,$c$;
  v_new_cols text := $c$caption_status,review_note,option_group,option_label)
  select a.client_id,a.content_item_id,$c$;
  v_old_sel text := $s$a.caption_status,a.review_note from public.content_review_assets a$s$;
  v_new_sel text := $s$a.caption_status,a.review_note,a.option_group,a.option_label from public.content_review_assets a$s$;
begin
  foreach v_fn in array array[
    'public.portal_core_evaluate_content_item_version(jsonb,boolean)',
    'public.begin_visual_request_revision(uuid[],text,uuid)'] loop
    v_def := pg_catalog.pg_get_functiondef(v_fn::pg_catalog.regprocedure);
    if (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_old_cols, '')))
         / pg_catalog.length(v_old_cols) <> 1
       or (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_old_sel, '')))
         / pg_catalog.length(v_old_sel) <> 1 then
      raise exception '0101: % does not contain the expected review-asset copy exactly once', v_fn;
    end if;
    execute pg_catalog.replace(pg_catalog.replace(v_def, v_old_cols, v_new_cols), v_old_sel, v_new_sel);
  end loop;
end
$rewrite$;

-- Repair: a copied row (same piece, key and file as the newest earlier row that had a group) gets
-- that group back. Only rows still ungrouped; a deliberate re-record that changed the file is left.
with prev as (
  select distinct on (a.id) a.id, a.url, p.option_group, p.option_label, p.url as prev_url
  from public.content_review_assets a
  join public.content_review_assets p
    on p.client_id = a.client_id and p.content_item_id = a.content_item_id
   and p.asset_key = a.asset_key and p.content_version < a.content_version
  where a.option_group is null
  order by a.id, p.content_version desc
)
update public.content_review_assets t
set option_group = prev.option_group, option_label = prev.option_label, updated_at = pg_catalog.now()
from prev
where t.id = prev.id and prev.option_group is not null and prev.prev_url = prev.url;

create or replace function public.assert_review_option_carry_security() returns void
language plpgsql security definer set search_path = '' as $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public.portal_core_evaluate_content_item_version(jsonb,boolean)',
    'public.begin_visual_request_revision(uuid[],text,uuid)'] loop
    if pg_catalog.pg_get_functiondef(v_fn::pg_catalog.regprocedure)
         not like '%review_note,option_group,option_label)%a.review_note,a.option_group,a.option_label from public.content_review_assets a%' then
      raise exception 'review option carry missing in %', v_fn;
    end if;
  end loop;
end;
$$;
revoke all on function public.assert_review_option_carry_security() from public, anon, authenticated;
grant execute on function public.assert_review_option_carry_security() to service_role;

alter function public.assert_portal_security() rename to assert_portal_pre_option_carry_security;
revoke all on function public.assert_portal_pre_option_carry_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_option_carry_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_pre_option_carry_security();
  perform public.assert_review_option_carry_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
