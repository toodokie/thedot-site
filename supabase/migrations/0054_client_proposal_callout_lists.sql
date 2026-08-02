-- A callout is a visual decision card. It may carry a short bullet list, just as the
-- TypeScript proposal parser and renderer already allow. 0053 accidentally permitted
-- items only on checklist blocks, causing otherwise valid agency proposal drafts to fail.

begin;

create or replace function public.portal_proposal_blocks_shape_valid(p_blocks jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_block jsonb; v_item jsonb; v_kind text; v_title text; v_body text; v_key text;
begin
  if pg_catalog.jsonb_typeof(p_blocks) <> 'array'
     or pg_catalog.jsonb_array_length(p_blocks) not between 1 and 40 then return false; end if;
  for v_block in select value from pg_catalog.jsonb_array_elements(p_blocks) loop
    if pg_catalog.jsonb_typeof(v_block) <> 'object' then return false; end if;
    for v_key in select key from pg_catalog.jsonb_object_keys(v_block) key loop
      if v_key not in ('kind','title','body','items','links') then return false; end if;
    end loop;
    v_kind := v_block->>'kind'; v_title := nullif(pg_catalog.btrim(v_block->>'title'),'');
    v_body := nullif(pg_catalog.btrim(v_block->>'body'),'');
    if v_kind not in ('heading','paragraph','callout','checklist','quote','links')
       or not (v_title is null or (pg_catalog.char_length(v_title) <= 300 and public.portal_client_summary_shape_valid(v_title)))
       or not (v_body is null or (pg_catalog.char_length(v_body) <= 8000 and public.portal_client_summary_shape_valid(v_body))) then
      return false;
    end if;
    if v_kind = 'heading' and v_title is null then return false; end if;
    if v_kind in ('paragraph','quote') and v_body is null then return false; end if;
    if v_kind = 'callout' and v_title is null and v_body is null then return false; end if;
    if v_kind = 'checklist' and not (v_block ? 'items') then return false; end if;
    if v_kind in ('checklist','callout') and v_block ? 'items' then
      if pg_catalog.jsonb_typeof(v_block->'items') <> 'array'
         or pg_catalog.jsonb_array_length(v_block->'items') not between 1 and 50 then return false; end if;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_block->'items') loop
        if pg_catalog.jsonb_typeof(v_item) <> 'string' or pg_catalog.char_length(v_item #>> '{}') not between 1 and 4000
           or not public.portal_client_summary_shape_valid(v_item #>> '{}') then return false; end if;
      end loop;
    elsif v_block ? 'items' then return false;
    end if;
    if v_kind = 'links' then
      if pg_catalog.jsonb_typeof(v_block->'links') <> 'array'
         or pg_catalog.jsonb_array_length(v_block->'links') not between 1 and 20 then return false; end if;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_block->'links') loop
        if pg_catalog.jsonb_typeof(v_item) <> 'object' or (v_item->>'label') is null or (v_item->>'url') is null
           or pg_catalog.char_length(pg_catalog.btrim(v_item->>'label')) not between 1 and 300
           or not public.portal_client_summary_shape_valid(v_item->>'label')
           or (v_item->>'url') !~ '^https://[^[:space:][:cntrl:]]+$'
           or (v_item->>'url') ~ '^https://[^/?#]*@' then return false; end if;
      end loop;
    elsif v_block ? 'links' then return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.portal_proposal_blocks_shape_valid(jsonb) from public, anon, authenticated, service_role;

do $$
begin
  if not public.portal_proposal_blocks_shape_valid(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('kind','callout','title','Decision','items',pg_catalog.jsonb_build_array('Approve','Request changes'))
  )) then raise exception 'proposal callout lists must be accepted'; end if;
  if public.portal_proposal_blocks_shape_valid(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('kind','heading','title','Not a list','items',pg_catalog.jsonb_build_array('unsafe shape'))
  )) then raise exception 'proposal items must remain limited to checklist or callout'; end if;
end;
$$;

select public.assert_portal_security();

commit;
