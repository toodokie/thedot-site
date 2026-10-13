-- Slice 7: client-safe invoices and billing administration.
-- Financial fields are immutable after issuance; corrections void the old invoice and issue a new
-- number. Status/document changes are separate, idempotent, audited agency operations.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.agency_actors') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null then
    raise exception '0011 agency-write objects must exist before applying 0012';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice6_security;
revoke all on function public.assert_portal_slice6_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice6_security() to service_role;

insert into public.activity_event_types(event_type) values
  ('invoice_issued'),('invoice_status_changed'),('invoice_document_attached')
on conflict(event_type) do nothing;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  number text not null check (number ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  issued_at date not null,
  period_start date,
  period_end date,
  amount numeric(12,2) not null check (amount > 0 and amount < 100000000),
  currency text not null default 'CAD' check (currency='CAD'),
  status text not null default 'unpaid' check (status in ('paid','unpaid','void')),
  document_url text check (
    document_url is null or document_url ~ '^https://(docs|drive)\.google\.com/[^[:space:][:cntrl:]]+$'
  ),
  document_object_key text check (
    document_object_key is null or (
      document_object_key ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$'
      and document_object_key !~ '(^|/)\.\.?(/|$)'
      and document_object_key !~ '//'
    )
  ),
  notes text check (notes is null or pg_catalog.char_length(notes)<=4000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique(id,client_id),
  unique(client_id,number),
  check ((period_start is null and period_end is null)
    or (period_start is not null and period_end is not null and period_end>=period_start))
);
create index invoices_by_client on public.invoices(client_id,issued_at desc,id);

alter table public.invoices enable row level security;
create policy invoices_read on public.invoices for select
  using (client_id in (select public.my_client_ids()));

create view public.invoices_client
with (security_invoker=true)
as select id,client_id,number,issued_at,period_start,period_end,amount,currency,status,
  document_url,updated_at
from public.invoices;

revoke all on public.invoices,public.invoices_client from public,anon,authenticated,service_role;
grant select(id,client_id,number,issued_at,period_start,period_end,amount,currency,status,
  document_url,updated_at) on public.invoices to authenticated;
grant select on public.invoices_client to authenticated;
grant select on public.invoices,public.invoices_client to service_role;

create or replace function public.upsert_invoice(
  p_client_id uuid,p_number text,p_issued_at date,p_period_start date,p_period_end date,
  p_amount numeric,p_currency text,p_document_url text,p_notes text,
  p_actor_key text,p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_invoice public.invoices%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_number text:=pg_catalog.btrim(p_number);
  v_currency text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency,'CAD')));
  v_url text:=nullif(pg_catalog.btrim(p_document_url),'');
  v_notes text:=nullif(pg_catalog.btrim(p_notes),'');
  v_fingerprint text;
  v_id uuid;
  v_inserted boolean;
  v_event_key text;
begin
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists(select 1 from public.clients c where c.id=p_client_id) then raise exception 'client not found'; end if;
  if v_number is null or v_number !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'
     or p_issued_at is null or p_issued_at>current_date+1
     or p_amount is null or p_amount<=0 or p_amount>=100000000 or v_currency<>'CAD'
     or ((p_period_start is null)<>(p_period_end is null))
     or (p_period_start is not null and p_period_end<p_period_start)
     or (v_url is not null and v_url !~ '^https://(docs|drive)\.google\.com/[^[:space:][:cntrl:]]+$')
     or (v_notes is not null and pg_catalog.char_length(v_notes)>4000)
     or p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'invalid invoice payload';
  end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('number',v_number,'issued_at',p_issued_at,
      'period_start',p_period_start,'period_end',p_period_end,'amount',p_amount,
      'currency',v_currency,'document_url',v_url,'notes',v_notes)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts r
    where r.client_id=p_client_id and r.idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.command_type<>'upsert_invoice' or v_receipt.request_fingerprint<>v_fingerprint
      then raise exception 'idempotency key reused with different request'; end if;
    return (v_receipt.response->>'id')::uuid;
  end if;

  insert into public.invoices(client_id,number,issued_at,period_start,period_end,amount,currency,
    document_url,notes)
  values(p_client_id,v_number,p_issued_at,p_period_start,p_period_end,p_amount,v_currency,v_url,v_notes)
  on conflict(client_id,number) do nothing returning id into v_id;
  v_inserted:=found;
  if not v_inserted then
    select * into strict v_invoice from public.invoices i
      where i.client_id=p_client_id and i.number=v_number for update;
    if v_invoice.issued_at is distinct from p_issued_at
       or v_invoice.period_start is distinct from p_period_start
       or v_invoice.period_end is distinct from p_period_end
       or v_invoice.amount is distinct from p_amount
       or v_invoice.currency is distinct from v_currency
       or v_invoice.document_url is distinct from v_url
       or v_invoice.notes is distinct from v_notes then
      raise exception 'issued invoice differs; void it and issue a new invoice number';
    end if;
    v_id:=v_invoice.id;
  else
    v_event_key:='agency:invoice-issued:'||p_idempotency_key;
    insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name)
    values(p_client_id,'invoice_issued',v_event_key,'Invoice '||v_number||' issued',null,
      'anastasia',v_actor.display_name);
  end if;
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,
    request_fingerprint,response)
  values(p_client_id,'upsert_invoice',p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_id,'inserted',v_inserted));
  return v_id;
end;
$$;

create or replace function public.set_invoice_status(
  p_client_id uuid,p_invoice_id uuid,p_status text,p_actor_key text,p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_invoice public.invoices%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_fingerprint text;
  v_changed boolean:=false;
  v_event_key text;
begin
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_status not in ('paid','unpaid','void') or p_idempotency_key is null
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'invalid invoice status payload';
  end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('invoice_id',p_invoice_id,'status',p_status)::text,'UTF8'),
    'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts r
    where r.client_id=p_client_id and r.idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.command_type<>'set_invoice_status' or v_receipt.request_fingerprint<>v_fingerprint
      then raise exception 'idempotency key reused with different request'; end if;
    return (v_receipt.response->>'id')::uuid;
  end if;
  select * into v_invoice from public.invoices i
    where i.id=p_invoice_id and i.client_id=p_client_id for update;
  if not found then raise exception 'invoice not found for client'; end if;
  if v_invoice.status='void' and p_status<>'void' then raise exception 'void invoice status is terminal'; end if;
  if v_invoice.status<>p_status then
    update public.invoices set status=p_status,updated_at=pg_catalog.now()
      where id=p_invoice_id and client_id=p_client_id;
    v_changed:=true;
    v_event_key:='agency:invoice-status:'||p_idempotency_key;
    insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name)
    values(p_client_id,'invoice_status_changed',v_event_key,
      'Invoice '||v_invoice.number||' marked '||p_status,null,'anastasia',v_actor.display_name);
  end if;
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,
    request_fingerprint,response)
  values(p_client_id,'set_invoice_status',p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',p_invoice_id,'changed',v_changed,'status',p_status));
  return p_invoice_id;
end;
$$;

create or replace function public.attach_invoice_document(
  p_client_id uuid,p_invoice_id uuid,p_document_url text,p_document_object_key text,
  p_actor_key text,p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_invoice public.invoices%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_url text:=nullif(pg_catalog.btrim(p_document_url),'');
  v_key text:=nullif(pg_catalog.btrim(p_document_object_key),'');
  v_fingerprint text;
  v_changed boolean:=false;
  v_event_key text;
begin
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if (v_url is null and v_key is null)
     or (v_url is not null and v_url !~ '^https://(docs|drive)\.google\.com/[^[:space:][:cntrl:]]+$')
     or (v_key is not null and (v_key !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$'
       or v_key ~ '(^|/)\.\.?(/|$)' or v_key ~ '//'))
     or p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'invalid invoice document payload';
  end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('invoice_id',p_invoice_id,'document_url',v_url,
      'document_object_key',v_key)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts r
    where r.client_id=p_client_id and r.idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.command_type<>'attach_invoice_document' or v_receipt.request_fingerprint<>v_fingerprint
      then raise exception 'idempotency key reused with different request'; end if;
    return (v_receipt.response->>'id')::uuid;
  end if;
  select * into v_invoice from public.invoices i
    where i.id=p_invoice_id and i.client_id=p_client_id for update;
  if not found then raise exception 'invoice not found for client'; end if;
  if v_invoice.document_url is distinct from v_url
     or v_invoice.document_object_key is distinct from v_key then
    update public.invoices set document_url=v_url,document_object_key=v_key,
      updated_at=pg_catalog.now() where id=p_invoice_id and client_id=p_client_id;
    v_changed:=true;
    v_event_key:='agency:invoice-document:'||p_idempotency_key;
    insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name)
    values(p_client_id,'invoice_document_attached',v_event_key,
      'Invoice '||v_invoice.number||' document updated',null,'anastasia',v_actor.display_name);
  end if;
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,
    request_fingerprint,response)
  values(p_client_id,'attach_invoice_document',p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',p_invoice_id,'changed',v_changed));
  return p_invoice_id;
end;
$$;

revoke all on function public.upsert_invoice(uuid,text,date,date,date,numeric,text,text,text,text,text)
  from public,anon,authenticated;
revoke all on function public.set_invoice_status(uuid,uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.attach_invoice_document(uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.upsert_invoice(uuid,text,date,date,date,numeric,text,text,text,text,text),
  public.set_invoice_status(uuid,uuid,text,text,text),
  public.attach_invoice_document(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.assert_portal_billing_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_actual text[]; v_expected text[]; v_columns text[];
begin
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp where cp.table_schema='public'
    and cp.table_name='invoices' and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  v_expected:=array['amount','client_id','currency','document_url','id','issued_at','number',
    'period_end','period_start','status','updated_at'];
  if v_actual is distinct from v_expected then raise exception 'unsafe invoice grants: %',v_actual; end if;

  select pg_catalog.array_agg(a.attname::text order by a.attnum) into v_columns
  from pg_catalog.pg_attribute a where a.attrelid='public.invoices_client'::pg_catalog.regclass
    and a.attnum>0 and not a.attisdropped;
  if v_columns is distinct from array['id','client_id','number','issued_at','period_start','period_end',
    'amount','currency','status','document_url','updated_at']::text[] then
    raise exception 'unsafe invoice view columns: %',v_columns;
  end if;
  if exists(select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('invoices','invoices_client') and tp.grantee in ('PUBLIC','anon'))
    then raise exception 'public/anon invoice relation privilege'; end if;
  if exists(select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('invoices','invoices_client') and tp.grantee in ('authenticated','service_role')
    and tp.privilege_type<>'SELECT') then raise exception 'direct invoice relation write privilege'; end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.invoices'::pg_catalog.regclass)
    then raise exception 'invoice RLS is disabled'; end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
    where p.schemaname='public' and p.tablename='invoices')<>1
     or not exists(select 1 from pg_catalog.pg_policies p where p.schemaname='public'
       and p.tablename='invoices' and p.policyname='invoices_read' and p.cmd='SELECT') then
    raise exception 'unexpected invoice RLS policy set';
  end if;
  if not exists(select 1 from pg_catalog.pg_class c where c.oid='public.invoices_client'::pg_catalog.regclass
    and coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true']) then
    raise exception 'invoice view is not security_invoker';
  end if;
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('upsert_invoice','set_invoice_status','attach_invoice_document')
      and (not p.prosecdef or not(coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']))) then
    raise exception 'invoice writer is not hardened SECURITY DEFINER';
  end if;
  if exists(select 1 from information_schema.routine_privileges rp where rp.specific_schema='public'
    and rp.routine_name in ('upsert_invoice','set_invoice_status','attach_invoice_document')
    and rp.grantee in ('PUBLIC','anon','authenticated')) then
    raise exception 'invoice writer exposed outside service role';
  end if;
  if not pg_catalog.has_function_privilege('service_role',
       'public.upsert_invoice(uuid,text,date,date,date,numeric,text,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.set_invoice_status(uuid,uuid,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.attach_invoice_document(uuid,uuid,text,text,text,text)','EXECUTE') then
    raise exception 'service role missing invoice writer execute';
  end if;
end;
$$;
revoke all on function public.assert_portal_billing_security() from public,anon,authenticated;
grant execute on function public.assert_portal_billing_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice6_security();
  perform public.assert_portal_billing_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
