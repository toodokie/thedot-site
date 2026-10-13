-- Maria could not edit the ep3 website article, and nothing told us she had tried.
--
-- A client edit carries the whole rewritten block, and the block is capped at 8,000 characters in
-- four functions plus the form. That number was written in 0014 when a copy block was a caption of
-- a few hundred characters. Long-form arrived later and nobody revisited it. The ep2 article body
-- was 7,864 characters and squeaked under; the ep3 body is 15,483 and did not. The form loaded her
-- article truncated at roughly the halfway point and the write would have been refused anyway.
--
-- The worse half of the incident is not fixed here: the refusal was silent to us. The article has
-- exactly one activity row in its whole life, us releasing it to her on September 13. She hit the
-- wall, we received nothing, and the piece would have published today recorded as "released, no
-- changes requested", indistinguishable from her having read it and been content. Surfacing a
-- refused edit is separate work and is not in this migration.
--
-- 50,000 is chosen to clear long-form comfortably rather than to sit just above today's article.
-- The cap is not a correctness boundary, it is an abuse and payload-size bound, and 50,000 is
-- still far below anything that threatens a JSON payload or a review surface.
--
-- Deliberately unchanged: comments stay at 4,000 and ideas at 4,000. Those are conversation
-- surfaces, not copy, and nothing has hit their limits.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.portal_content_request_payload_valid(text,jsonb)') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0088 requires the content request system';
  end if;
end;
$$;

select public.assert_portal_security();

-- Each rewrite asserts the old text is present first, in the style of 0083 and 0086, so it cannot
-- silently no-op if an earlier migration has already changed the shape.
do $rewrite$
declare
  v_fn text;
  v_def text;
  v_old text;
  v_new text;
  v_pairs text[][] := array[
    ['public.portal_content_request_payload_valid(text,jsonb)',
     $o$pg_catalog.char_length(pg_catalog.btrim(p_payload->>'proposed_text')) between 1 and 8000$o$,
     $n$pg_catalog.char_length(pg_catalog.btrim(p_payload->>'proposed_text')) between 1 and 50000$n$],
    ['public.portal_core_request_content_edit(uuid,integer,text,text,uuid)',
     $o$pg_catalog.char_length(pg_catalog.btrim(p_proposed_text)) not between 1 and 8000$o$,
     $n$pg_catalog.char_length(pg_catalog.btrim(p_proposed_text)) not between 1 and 50000$n$],
    ['public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)',
     $o$v_text is null or pg_catalog.char_length(v_text) not between 1 and 8000$o$,
     $n$v_text is null or pg_catalog.char_length(v_text) not between 1 and 50000$n$],
    ['public.upsert_content_request_review_candidate(uuid,text,text,text,uuid)',
     $o$v_candidate is null or pg_catalog.char_length(v_candidate) not between 1 and 8000$o$,
     $n$v_candidate is null or pg_catalog.char_length(v_candidate) not between 1 and 50000$n$]
  ];
  i integer;
begin
  for i in 1 .. pg_catalog.array_length(v_pairs, 1) loop
    v_fn := v_pairs[i][1];
    v_old := v_pairs[i][2];
    v_new := v_pairs[i][3];
    select pg_catalog.pg_get_functiondef(v_fn::pg_catalog.regprocedure) into v_def;
    if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
      raise exception 'edit length limit drifted in %; 0088 will not rewrite it blindly', v_fn;
    end if;
    execute pg_catalog.replace(v_def, v_old, v_new);
  end loop;
end;
$rewrite$;

-- pg_get_functiondef preserves ownership and definer flags, but grants are reset by CREATE OR
-- REPLACE, so restore the exact set each function had.
-- Verified against the live grants before writing: payload_valid and the core edit writer carry
-- no execute grant at all and are reached only from inside other SECURITY DEFINER functions.
revoke all on function public.portal_content_request_payload_valid(text,jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.portal_core_request_content_edit(uuid,integer,text,text,uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid) to authenticated;

revoke all on function public.upsert_content_request_review_candidate(uuid,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.upsert_content_request_review_candidate(uuid,text,text,text,uuid)
  to service_role;

create or replace function public.assert_portal_edit_length_security() returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_fn text;
  v_def text;
  v_fns text[] := array[
    'public.portal_content_request_payload_valid(text,jsonb)',
    'public.portal_core_request_content_edit(uuid,integer,text,text,uuid)',
    'public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)',
    'public.upsert_content_request_review_candidate(uuid,text,text,text,uuid)'
  ];
  i integer;
begin
  for i in 1 .. pg_catalog.array_length(v_fns, 1) loop
    v_fn := v_fns[i];
    select pg_catalog.pg_get_functiondef(v_fn::pg_catalog.regprocedure) into v_def;
    -- Every one of these must still bound the text, and must no longer bound it at the caption-era
    -- 8,000. A limit that silently disappears is as bad as one that is too small.
    if v_def is null or v_def not like '%50000%' or v_def like '%and 8000%' then
      raise exception 'edit length limit is wrong in %', v_fn;
    end if;
  end loop;
  -- The client seat submits edits; it must never reach the agency-side writers.
  if pg_catalog.has_function_privilege('authenticated',
       'public.upsert_content_request_review_candidate(uuid,text,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)','EXECUTE') then
    raise exception 'content request grants are unsafe';
  end if;
end;
$$;

revoke all on function public.assert_portal_edit_length_security() from public, anon, authenticated;
grant execute on function public.assert_portal_edit_length_security() to service_role;

select public.assert_portal_edit_length_security();

create or replace function public.assert_portal_slice87_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice86_security();
  perform public.assert_agency_supersession_security();
end;
$$;
revoke all on function public.assert_portal_slice87_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice87_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice87_security();
  perform public.assert_portal_edit_length_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
