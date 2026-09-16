-- The courtesy-release guard asks who produced the piece. It should ask whether this is an
-- explicit agency override standing in for a client decision.
--
-- 0043 reserved the courtesy release for studio content, and said why: it exists "for material
-- such as a studio-owned, already-live cut where the agency has deliberately decided that Maria's
-- approval is a non-blocking courtesy review." `producer = 'studio'` was shorthand for "not our
-- own homework", because waiving the client's approval on work The Dot originated is a conflict
-- of interest in a way that waiving it on her own firm's already-public footage is not.
--
-- 0060 then let The Dot content through as well, provided the reason begins
-- "Agency override authorized by Anastasia:". That dissolved the distinction the guard was
-- protecting: the producer value no longer decides whether an agency release is permitted, only
-- which words the caller must type. The safeguard that actually carries the meaning is the named
-- override, and it means the same thing whoever produced the piece.
--
-- What the producer check still does is worse than nothing. `producer` is nullable (0025), and a
-- null matches neither branch, so a version whose producer was never recorded is hard-blocked
-- from release. A missing metadata field then presents itself as a conflict-of-interest stop. On
-- 2026-09-16 that blocked kanset-2026-09-07-news-roundup, a piece that had been live on YouTube
-- for eight days, and 34 of 164 versions are in the same state.
--
-- So the gate moves onto the override. Studio-produced content keeps its existing path untouched.
-- Everything else, including a version with no recorded producer, requires the named override,
-- exactly as The Dot content already did. This widens the permitted set by one case: an explicit,
-- audited Anastasia override on a piece whose producer was never recorded.
--
-- `producer` keeps its real jobs, which are editorial rather than procedural: studio-produced
-- content must carry the "Video production by @loftcreativespace" credit in every caption, and
-- the design system applies different rules to filmed talking-head footage than to animated
-- reels. Those are reasons to record it accurately, and portal-health already counts the ones
-- that are missing. They are not reasons to refuse a release.

begin;

do $$
begin
  if pg_catalog.to_regprocedure(
       'public.record_content_courtesy_release(uuid,integer,text,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.assert_portal_courtesy_release_security()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0086 requires the courtesy-release workflow';
  end if;
end;
$$;

select public.assert_portal_security();

-- 1. The guard itself.
do $rewrite$
declare
  v_def text;
  v_old text := $old$  if v_producer is distinct from 'studio'
     and not coalesce(
       v_producer = 'the_dot'
       and pg_catalog.lower(v_reason) like 'agency override authorized by anastasia:%',
       false
     ) then
    raise exception 'courtesy release requires studio content or an explicit Anastasia agency override';
  end if;$old$;
  v_new text := $new$  -- Studio-produced content keeps the original non-blocking courtesy path. Anything else,
  -- whatever its producer and including a version that never recorded one, needs the named
  -- override, so an agency self-approval is always distinguishable in the audit trail. The
  -- producer value is not what makes an override safe; the named authorization is. See 0086.
  if v_producer is distinct from 'studio'
     and pg_catalog.lower(coalesce(v_reason, '')) not like 'agency override authorized by anastasia:%' then
    raise exception 'courtesy release requires studio content or an explicit Anastasia agency override';
  end if;$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_content_courtesy_release(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'courtesy release producer guard drifted; 0086 will not rewrite it blindly';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;

revoke all on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  to service_role;

-- 2. The assertion pinned `v_producer = 'the_dot'`, which no longer appears. Re-pin it to the
--    shape that now carries the rule, so the fold still fails if the override requirement is
--    ever weakened or the studio path is ever widened.
do $rewrite_assertion$
declare
  v_def text;
  v_old text := $old$
     or v_def not ilike '%agency override authorized by anastasia:%'
     or v_def not ilike '%v_producer = ''the_dot''%'
     or v_def not ilike '%v_producer is distinct from ''studio''%'
$old$;
  v_new text := $new$
     or v_def not ilike '%agency override authorized by anastasia:%'
     or v_def not ilike '%not like%'
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

select public.assert_portal_courtesy_release_security();
select public.assert_portal_security();

commit;
