begin;

do $$
declare
  v_a uuid:=gen_random_uuid(); v_b uuid:=gen_random_uuid();
  v_invoice uuid; v_retry uuid; v_count bigint; v_failed boolean;
begin
  insert into public.clients(id,name,slug) values
    (v_a,'Billing A','billing-a'),(v_b,'Billing B','billing-b');

  set local role service_role;
  v_invoice:=public.upsert_invoice(v_a,'0137','2026-06-27','2026-06-27','2026-07-26',
    800,'CAD','https://docs.google.com/document/d/invoice-0137','private fee context',
    'thedot-admin','invoice-test-issue');
  v_retry:=public.upsert_invoice(v_a,'0137','2026-06-27','2026-06-27','2026-07-26',
    800,'CAD','https://docs.google.com/document/d/invoice-0137','private fee context',
    'thedot-admin','invoice-test-issue');
  reset role;
  if v_invoice<>v_retry then raise exception 'invoice retry changed identity'; end if;
  select count(*) into v_count from public.activity_log
    where client_id=v_a and event_key='agency:invoice-issued:invoice-test-issue';
  if v_count<>1 then raise exception 'invoice retry duplicated issuance activity'; end if;

  v_failed:=false;
  begin
    set local role service_role;
    perform public.upsert_invoice(v_a,'0137','2026-06-27','2026-06-27','2026-07-26',
      900,'CAD','https://docs.google.com/document/d/invoice-0137','private fee context',
      'thedot-admin','invoice-test-issue');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'invoice idempotency mismatch was accepted'; end if;

  v_failed:=false;
  begin
    set local role service_role;
    perform public.upsert_invoice(v_a,'0137','2026-06-27','2026-06-27','2026-07-26',
      900,'CAD','https://docs.google.com/document/d/invoice-0137','private fee context',
      'thedot-admin','invoice-test-rewrite');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'issued financial fields were silently rewritten'; end if;

  set local role service_role;
  perform public.set_invoice_status(v_a,v_invoice,'paid','thedot-admin','invoice-test-paid');
  perform public.set_invoice_status(v_a,v_invoice,'paid','thedot-admin','invoice-test-paid');
  perform public.attach_invoice_document(v_a,v_invoice,
    'https://drive.google.com/file/d/invoice-0137','invoices/0137.pdf',
    'thedot-admin','invoice-test-document');
  perform public.attach_invoice_document(v_a,v_invoice,
    'https://drive.google.com/file/d/invoice-0137','invoices/0137.pdf',
    'thedot-admin','invoice-test-document');
  reset role;
  select count(*) into v_count from public.activity_log where client_id=v_a
    and event_key in ('agency:invoice-status:invoice-test-paid',
      'agency:invoice-document:invoice-test-document');
  if v_count<>2 then raise exception 'status/document retry duplicated or lost audit activity'; end if;

  v_failed:=false;
  begin
    set local role service_role;
    perform public.set_invoice_status(v_b,v_invoice,'unpaid','thedot-admin','invoice-test-cross');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'cross-tenant invoice status change was accepted'; end if;

  v_failed:=false;
  begin
    set local role service_role;
    perform public.attach_invoice_document(v_a,v_invoice,'https://evil.example/invoice','../secret',
      'thedot-admin','invoice-test-unsafe-document');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'unsafe invoice document was accepted'; end if;

  set local role service_role;
  perform public.set_invoice_status(v_a,v_invoice,'void','thedot-admin','invoice-test-void');
  reset role;
  v_failed:=false;
  begin
    set local role service_role;
    perform public.set_invoice_status(v_a,v_invoice,'paid','thedot-admin','invoice-test-unvoid');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'void invoice was revived'; end if;
end;
$$;

select public.assert_portal_security();
rollback;
