-- Permit an explicit, version-bound Anastasia override for The Dot-produced
-- content without fabricating a Maria approval. Studio courtesy releases keep
-- their existing path. The reason prefix is enforced in the service-role RPC.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.record_content_courtesy_release(uuid,integer,text,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0060 requires the courtesy-release workflow';
  end if;
end;
$$;

select public.assert_portal_security();

do $rewrite$
declare
  v_def text;
  v_old text := $old$
  if v_producer is distinct from 'studio' then
    raise exception 'courtesy release is reserved for studio-produced content';
  end if;
$old$;
  v_new text := $new$
  if v_producer is distinct from 'studio'
     and not coalesce(
       v_producer = 'the_dot'
       and pg_catalog.lower(v_reason) like 'agency override authorized by anastasia:%',
       false
     ) then
    raise exception 'courtesy release requires studio content or an explicit Anastasia agency override';
  end if;
$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_content_courtesy_release(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'record_content_courtesy_release producer guard drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;
revoke all on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  to service_role;

do $rewrite_assertion$
declare
  v_def text;
  v_old text := $old$
     or v_def not ilike '%v_producer is distinct from ''studio''%'
$old$;
  v_new text := $new$
     or v_def not ilike '%agency override authorized by anastasia:%'
     or v_def not ilike '%v_producer = ''the_dot''%'
     or v_def not ilike '%v_producer is distinct from ''studio''%'
$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.assert_portal_courtesy_release_security()'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'courtesy release security assertion drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite_assertion$;
revoke all on function public.assert_portal_courtesy_release_security()
  from public, anon, authenticated, service_role;
grant execute on function public.assert_portal_courtesy_release_security() to service_role;

select public.assert_portal_security();
commit;
