-- REVIEW ONLY. No live application. Requires reviewed Business foundation.
begin;
create schema if not exists studio_private_business;
revoke all on schema studio_private_business from public,anon;
grant usage on schema studio_private_business to authenticated;
create table if not exists public.studio_private_books (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 title text not null check(length(trim(title)) between 1 and 160), plan_id uuid,
 created_by uuid not null references auth.users(id), revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), foreign key(workspace_id,plan_id) references public.studio_business_plans(workspace_id,id)
);
create table if not exists public.studio_private_book_grants (
 workspace_id uuid not null, book_id uuid not null, user_id uuid not null references auth.users(id),
 permission text not null check(permission in ('read','edit')), granted_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(book_id,user_id), foreign key(workspace_id,user_id) references public.workspace_members(workspace_id,user_id) on delete cascade, foreign key(workspace_id,book_id) references public.studio_private_books(workspace_id,id)
);
create table if not exists public.studio_private_records (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, book_id uuid not null,
 kind text not null check(kind in ('document','contract','budget','commitment','expense','income')),
 title text not null check(length(trim(title)) between 1 and 240), notes text not null default '' check(length(notes)<=10000),
 owner_id uuid not null references auth.users(id), category text not null default '' check(length(category)<=120), counterparty text not null default '' check(length(counterparty)<=240),
 status text not null default 'active', amount_minor bigint check(amount_minor between 0 and 9000000000000), currency text,
 effective_date date, due_date date, renewal_date date, notice_date date,
 budget_id uuid, commitment_id uuid, document_version_id uuid, approved_snapshot_id uuid,
 signed_marked_at timestamptz, signed_marked_by uuid references auth.users(id),
 revision integer not null default 0 check(revision>=0), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,book_id,id), foreign key(workspace_id,book_id) references public.studio_private_books(workspace_id,id),
 foreign key(workspace_id,book_id,budget_id) references public.studio_private_records(workspace_id,book_id,id),
 foreign key(workspace_id,book_id,commitment_id) references public.studio_private_records(workspace_id,book_id,id),
 check((kind='contract' and status in ('draft','under_review','marked_signed','expired','archived')) or (kind='document' and status in ('active','archived')) or (kind in ('budget','commitment','expense','income') and status in ('active','void'))),
 check((amount_minor is null)=(currency is null)), check(currency is null or currency in ('USD','EUR','GBP','AUD','CAD','CHF','CNY','NZD','SEK','NOK','DKK','INR','SGD','HKD','JPY','KRW','KWD','BHD','OMR')),
 check(kind not in ('budget','commitment','expense','income') or amount_minor is not null),
 check(kind not in ('expense','income','commitment') or effective_date is not null),
 check(kind='contract' or (renewal_date is null and notice_date is null and signed_marked_at is null and signed_marked_by is null)),
 check(kind in ('commitment','expense','income') or budget_id is null), check(kind='expense' or commitment_id is null),
 check(kind<>'document' or amount_minor is null), check(kind='budget' or approved_snapshot_id is null),
 check(budget_id is distinct from id and commitment_id is distinct from id)
);
create table if not exists public.studio_private_document_versions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, book_id uuid not null, document_id uuid not null,
 ordinal integer not null check(ordinal>0), label text not null check(length(trim(label)) between 1 and 100),
 url text not null check(length(url)<=3000 and url ~ '^https://[^/@:[:space:]]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' and url !~* '[?&#](access_token|token|password|secret|signature|sig|api_key|key|authorization|auth|oauth_token|awsaccesskeyid|resourcekey|rlkey|x-amz-[^=&#]+|x-goog-[^=&#]+)=' and url !~ '[?&#][^=&#]*%'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(workspace_id,book_id,id), unique(document_id,ordinal), foreign key(workspace_id,book_id,document_id) references public.studio_private_records(workspace_id,book_id,id)
);
create table if not exists public.studio_private_record_history (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, book_id uuid not null, record_id uuid not null,
 revision integer not null, snapshot jsonb not null, reason text not null check(length(reason) between 1 and 1000),
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(record_id,revision), foreign key(workspace_id,book_id,record_id) references public.studio_private_records(workspace_id,book_id,id)
);
create table if not exists public.studio_private_budget_approvals (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, book_id uuid not null, record_id uuid not null, record_revision integer not null,
 purpose text not null check(purpose='manual_budget_plan_only'), snapshot jsonb not null, rationale text not null check(length(trim(rationale)) between 1 and 2000),
 approved_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(workspace_id,book_id,id), foreign key(workspace_id,book_id,record_id) references public.studio_private_records(workspace_id,book_id,id)
);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='private_document_version_same_book') then alter table public.studio_private_records add constraint private_document_version_same_book foreign key(workspace_id,book_id,document_version_id) references public.studio_private_document_versions(workspace_id,book_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='private_approval_same_book') then alter table public.studio_private_records add constraint private_approval_same_book foreign key(workspace_id,book_id,approved_snapshot_id) references public.studio_private_budget_approvals(workspace_id,book_id,id); end if;
end $$;
create table if not exists studio_private_business.requests (
 workspace_id uuid not null, actor_id uuid not null, request_id uuid not null, book_id uuid not null,
 operation text not null, input jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(workspace_id,actor_id,request_id), foreign key(workspace_id,book_id) references public.studio_private_books(workspace_id,id)
);
alter table studio_private_business.requests enable row level security;
revoke all on studio_private_business.requests from public,anon,authenticated;
-- Only this narrow ACL lookup bypasses RLS; auth.uid and current membership are mandatory.
create or replace function studio_private_business.access(w uuid,b uuid,mode text default 'read') returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from public.workspace_members m join public.studio_private_books r on r.workspace_id=m.workspace_id where m.workspace_id=w and m.user_id=auth.uid() and r.id=b and (m.role='owner' or r.created_by=auth.uid() or (mode<>'manage' and exists(select 1 from public.studio_private_book_grants g where g.workspace_id=w and g.book_id=b and g.user_id=auth.uid() and (mode='read' or g.permission='edit')))))
$$;
revoke all on function studio_private_business.access(uuid,uuid,text) from public,anon;
grant execute on function studio_private_business.access(uuid,uuid,text) to authenticated;
do $$ declare t text; begin
 foreach t in array array['studio_private_books','studio_private_book_grants','studio_private_records','studio_private_document_versions','studio_private_record_history','studio_private_budget_approvals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists private_book_read on public.%I',t);
  execute format('create policy private_book_read on public.%I for select to authenticated using(studio_private_business.access(workspace_id,%I,''read''))',t,case when t='studio_private_books' then 'id' else 'book_id' end);
 end loop;
end $$;
create index if not exists private_books_workspace on public.studio_private_books(workspace_id,updated_at desc,id);
create index if not exists private_grants_user on public.studio_private_book_grants(workspace_id,user_id,book_id);
create index if not exists private_records_book on public.studio_private_records(workspace_id,book_id,kind,updated_at desc,id);
create index if not exists private_records_commitment on public.studio_private_records(workspace_id,book_id,commitment_id);
create index if not exists private_records_document on public.studio_private_records(workspace_id,book_id,document_version_id);
create index if not exists private_records_approval on public.studio_private_records(workspace_id,book_id,approved_snapshot_id);
create index if not exists private_records_budget on public.studio_private_records(workspace_id,book_id,budget_id);
create index if not exists private_versions_book on public.studio_private_document_versions(workspace_id,book_id,document_id,ordinal desc);
create index if not exists private_history_book on public.studio_private_record_history(workspace_id,book_id,record_id,revision desc);
create index if not exists private_approval_book on public.studio_private_budget_approvals(workspace_id,book_id,record_id,created_at desc);
create or replace function studio_private_business.immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$ begin raise exception 'Immutable private history' using errcode='42501'; end $$;
revoke all on function studio_private_business.immutable() from public,anon,authenticated;
do $$ declare t text; begin foreach t in array array['studio_private_document_versions','studio_private_record_history','studio_private_budget_approvals'] loop
 execute format('drop trigger if exists private_immutable on public.%I',t);execute format('create trigger private_immutable before update or delete on public.%I for each row execute function studio_private_business.immutable()',t);
end loop; end $$;
create or replace function studio_private_business.record_json(r public.studio_private_records) returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$ select to_jsonb(r)||jsonb_build_object('amount_minor',r.amount_minor::text) $$;
revoke all on function studio_private_business.record_json(public.studio_private_records) from public,anon;
grant execute on function studio_private_business.record_json(public.studio_private_records) to authenticated;
create or replace function public.studio_private_business_capabilities(p_workspace uuid) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$ begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=auth.uid()) then raise exception 'Access denied' using errcode='42501'; end if;
 return jsonb_build_object('schemaVersion',1,'restrictedRecords',true,'documentUploads',false,'externalReferences',true,'payments',false,'signatures',false);
end $$;
revoke all on function public.studio_private_business_capabilities(uuid) from public,anon;
grant execute on function public.studio_private_business_capabilities(uuid) to authenticated;

create or replace function studio_private_business.mutate(p_workspace uuid,p_operation text,p_request uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid(); b public.studio_private_books; r public.studio_private_records; oldr public.studio_private_records; linked public.studio_private_records; c studio_private_business.requests; d jsonb; result jsonb; bid uuid; rid uuid; vid uuid; allowed text[]; reason text; target uuid;
begin
 if actor is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=actor) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_request is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>30000 then raise exception 'Invalid request' using errcode='22023'; end if;
 allowed:=case p_operation when 'createBook' then array['title','plan_id'] when 'updateBook' then array['book_id','expected_revision','title','plan_id'] when 'saveRecord' then array['book_id','id','expected_revision','record','reason'] when 'addDocumentVersion' then array['book_id','id','expected_revision','label','url'] when 'approveBudget' then array['book_id','id','expected_revision','rationale','purpose'] when 'setGrant' then array['book_id','expected_revision','user_id','permission'] else null end;
 if allowed is null or p_input-allowed<>'{}'::jsonb then raise exception 'Unknown operation or fields' using errcode='22023'; end if;
 -- Serialize every write and permission change in a register. Replays cannot race ACL revocation.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text||actor::text||p_request::text,0));
 select * into c from studio_private_business.requests where workspace_id=p_workspace and actor_id=actor and request_id=p_request;
 bid:=coalesce(nullif(p_input->>'book_id','')::uuid,c.book_id);
 if p_operation<>'createBook' or c.book_id is not null then
  select * into b from public.studio_private_books where workspace_id=p_workspace and id=bid for update;
  if b.id is null or not studio_private_business.access(p_workspace,bid,case when p_operation in ('setGrant','updateBook','approveBudget') then 'manage' else 'edit' end) then raise exception 'Access denied' using errcode='42501'; end if;
 end if;
 if c.request_id is not null then
  if c.operation<>p_operation or c.input<>p_input then raise exception 'Request conflict' using errcode='40001'; end if;
  return c.result;
 end if;
 if p_operation in ('createBook','updateBook') then
  target:=nullif(p_input->>'plan_id','')::uuid;
  if target is not null and not exists(select 1 from public.studio_business_plans p join public.studio_projects q on p.id=q.id and p.workspace_id=q.workspace_id where p.workspace_id=p_workspace and p.id=target) then raise exception 'Plan is unavailable' using errcode='42501'; end if;
  if p_operation='createBook' then
   insert into public.studio_private_books(workspace_id,title,plan_id,created_by) values(p_workspace,trim(p_input->>'title'),target,actor) returning * into b; bid:=b.id;
  else
   if (p_input->>'expected_revision')::integer is distinct from b.revision then raise exception 'Revision conflict' using errcode='40001'; end if;
   update public.studio_private_books set title=trim(p_input->>'title'),plan_id=target,revision=revision+1,updated_at=now() where id=bid returning * into b;
  end if;
  result:=jsonb_build_object('book',to_jsonb(b));
 elsif p_operation='setGrant' then
  if (p_input->>'expected_revision')::integer is distinct from b.revision then raise exception 'Revision conflict' using errcode='40001'; end if;
  target:=(p_input->>'user_id')::uuid;
  if target is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=target) then raise exception 'Current workspace member required' using errcode='22023'; end if;
  if target=b.created_by or exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=target and role='owner') then raise exception 'Owner access is intrinsic to this register' using errcode='22023'; end if;
  if p_input->>'permission'='none' then delete from public.studio_private_book_grants where book_id=bid and user_id=target;
  elsif p_input->>'permission' in ('read','edit') then insert into public.studio_private_book_grants(workspace_id,book_id,user_id,permission,granted_by) values(p_workspace,bid,target,p_input->>'permission',actor) on conflict(book_id,user_id) do update set permission=excluded.permission,granted_by=excluded.granted_by,created_at=now();
  else raise exception 'Invalid permission' using errcode='22023'; end if;
  update public.studio_private_books set revision=revision+1,updated_at=now() where id=bid returning * into b;
  result:=jsonb_build_object('book',to_jsonb(b),'permission',p_input->>'permission');
 else
  rid:=nullif(p_input->>'id','')::uuid;
  if rid is not null then
   select * into oldr from public.studio_private_records where workspace_id=p_workspace and book_id=bid and id=rid for update;
   if oldr.id is null then raise exception 'Record unavailable' using errcode='42501'; end if;
   if (p_input->>'expected_revision')::integer is distinct from oldr.revision then raise exception 'Revision conflict' using errcode='40001'; end if;
  elsif p_operation<>'saveRecord' or p_input ? 'expected_revision' then raise exception 'Record required' using errcode='22023'; end if;
  if p_operation='saveRecord' then
   d:=p_input->'record';
   if jsonb_typeof(d) is distinct from 'object' or d-array['kind','title','notes','owner_id','category','counterparty','status','amount_minor','currency','effective_date','due_date','renewal_date','notice_date','budget_id','commitment_id','document_version_id']<>'{}'::jsonb then raise exception 'Invalid record fields' using errcode='22023'; end if;
   if d ? 'amount_minor' and d->>'amount_minor' is not null and (jsonb_typeof(d->'amount_minor')<>'string' or (d->>'amount_minor') !~ '^(0|[1-9][0-9]{0,12})$') then raise exception 'Amount must be exact nonnegative minor units' using errcode='22023'; end if;
   r:=jsonb_populate_record(null::public.studio_private_records,d);r.id:=coalesce(rid,gen_random_uuid());r.workspace_id:=p_workspace;r.book_id:=bid;r.created_by:=coalesce(oldr.created_by,actor);r.created_at:=coalesce(oldr.created_at,now());r.updated_at:=now();r.revision:=coalesce(oldr.revision+1,0);
   r.notes:=coalesce(r.notes,'');r.category:=coalesce(r.category,'');r.counterparty:=coalesce(r.counterparty,'');r.owner_id:=coalesce(r.owner_id,actor);r.title:=trim(r.title);r.status:=coalesce(r.status,case when r.kind='contract' then 'draft' else 'active' end);r.approved_snapshot_id:=oldr.approved_snapshot_id;
   if oldr.id is not null and r.kind is distinct from oldr.kind then raise exception 'Record kind is immutable' using errcode='22023'; end if;
   if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=r.owner_id) then raise exception 'Owner must be a current member; assignment does not grant access' using errcode='22023'; end if;
   if r.kind='document' then r.document_version_id:=oldr.document_version_id; end if;
   if oldr.kind='contract' and oldr.status<>'under_review' and r.document_version_id is distinct from oldr.document_version_id and exists(select 1 from public.studio_private_record_history h where h.record_id=oldr.id and h.snapshot->>'signed_marked_at' is not null) then raise exception 'Return contract to review before changing its signed reference' using errcode='22023'; end if;
   if r.kind='contract' and r.status='marked_signed' then r.signed_marked_at:=case when oldr.status='marked_signed' then oldr.signed_marked_at else now() end;r.signed_marked_by:=case when oldr.status='marked_signed' then oldr.signed_marked_by else actor end;
   elsif r.kind='contract' and r.status in ('expired','archived') then r.signed_marked_at:=oldr.signed_marked_at;r.signed_marked_by:=oldr.signed_marked_by; end if;
   if r.budget_id is not null then
    select * into linked from public.studio_private_records where workspace_id=p_workspace and book_id=bid and id=r.budget_id and kind='budget';
    if linked.id is null or linked.currency is distinct from r.currency or (r.status='active' and linked.status<>'active') then raise exception 'Same-currency active budget required in this register' using errcode='22023'; end if;
   end if;
   if r.commitment_id is not null then
    select * into linked from public.studio_private_records where workspace_id=p_workspace and book_id=bid and id=r.commitment_id and kind='commitment';
    if linked.id is null or linked.currency is distinct from r.currency or (r.status='active' and linked.status<>'active') or r.budget_id is distinct from linked.budget_id then raise exception 'Same-currency active commitment and its budget required in this register' using errcode='22023'; end if;
   end if;
   if r.document_version_id is not null and not exists(select 1 from public.studio_private_document_versions where workspace_id=p_workspace and book_id=bid and id=r.document_version_id) then raise exception 'Document version unavailable' using errcode='42501'; end if;
   if oldr.id is not null and (r.currency is distinct from oldr.currency or r.status='void' or r.budget_id is distinct from oldr.budget_id) and exists(select 1 from public.studio_private_records where workspace_id=p_workspace and book_id=bid and status='active' and (budget_id=rid or commitment_id=rid)) then raise exception 'Correct linked records first' using errcode='22023'; end if;
   reason:=case when oldr.id is null then 'Created' else trim(p_input->>'reason') end;
   if reason is null or length(reason)<3 or length(reason)>1000 then raise exception 'A correction reason is required' using errcode='22023'; end if;
   if oldr.id is null then insert into public.studio_private_records select (r).*;
   else update public.studio_private_records set title=r.title,notes=r.notes,owner_id=r.owner_id,category=r.category,counterparty=r.counterparty,status=r.status,amount_minor=r.amount_minor,currency=r.currency,effective_date=r.effective_date,due_date=r.due_date,renewal_date=r.renewal_date,notice_date=r.notice_date,budget_id=r.budget_id,commitment_id=r.commitment_id,document_version_id=r.document_version_id,signed_marked_at=r.signed_marked_at,signed_marked_by=r.signed_marked_by,revision=r.revision,updated_at=r.updated_at where id=rid; end if;
  elsif p_operation='addDocumentVersion' then
   if oldr.kind<>'document' then raise exception 'Document required' using errcode='22023'; end if;
   insert into public.studio_private_document_versions(workspace_id,book_id,document_id,ordinal,label,url,created_by) values(p_workspace,bid,rid,(select coalesce(max(ordinal),0)+1 from public.studio_private_document_versions where document_id=rid),trim(p_input->>'label'),p_input->>'url',actor) returning id into vid;
   update public.studio_private_records set document_version_id=vid,revision=revision+1,updated_at=now() where id=rid returning * into r;reason:='Linked document reference version';
  elsif p_operation='approveBudget' then
   if oldr.kind<>'budget' or oldr.status<>'active' or p_input->>'purpose' is distinct from 'manual_budget_plan_only' then raise exception 'Active budget and explicit plan-only approval required' using errcode='22023'; end if;
   insert into public.studio_private_budget_approvals(workspace_id,book_id,record_id,record_revision,purpose,snapshot,rationale,approved_by) values(p_workspace,bid,rid,oldr.revision,'manual_budget_plan_only',studio_private_business.record_json(oldr),trim(p_input->>'rationale'),actor) returning id into vid;
   update public.studio_private_records set approved_snapshot_id=vid,revision=revision+1,updated_at=now() where id=rid returning * into r;reason:='Approved manual budget plan only; no spending authority';
  end if;
  insert into public.studio_private_record_history(workspace_id,book_id,record_id,revision,snapshot,reason,actor_id) values(p_workspace,bid,r.id,r.revision,studio_private_business.record_json(r),reason,actor);
  update public.studio_private_books set updated_at=now() where id=bid;
  result:=jsonb_build_object('record',studio_private_business.record_json(r));
 end if;
 insert into studio_private_business.requests(workspace_id,actor_id,request_id,book_id,operation,input,result) values(p_workspace,actor,p_request,bid,p_operation,p_input,result);
 return result;
end $$;
revoke all on function studio_private_business.mutate(uuid,text,uuid,jsonb) from public,anon;
grant execute on function studio_private_business.mutate(uuid,text,uuid,jsonb) to authenticated;
create or replace function public.studio_private_business_mutate(p_workspace uuid,p_operation text,p_request uuid,p_input jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$ select studio_private_business.mutate(p_workspace,p_operation,p_request,p_input) $$;
revoke all on function public.studio_private_business_mutate(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.studio_private_business_mutate(uuid,text,uuid,jsonb) to authenticated;

create or replace function public.studio_private_business_read(p_workspace uuid,p_book uuid default null,p_record uuid default null,p_kind text default 'all',p_page integer default 0,p_query text default '',p_options text default null) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare result jsonb; b public.studio_private_books; rec public.studio_private_records; rows jsonb; totals jsonb; n bigint; q text:=lower(coalesce(p_query,''));
begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=auth.uid()) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 or length(q)>200 or p_kind not in ('all','document','contract','budget','commitment','expense','income') then raise exception 'Invalid query' using errcode='22023'; end if;
 if p_options is not null then
  if p_options='plans' then
   select count(*) into n from public.studio_business_plans x join public.studio_projects p on p.id=x.id and p.workspace_id=x.workspace_id where x.workspace_id=p_workspace and position(q in lower(p.title))>0;
   select coalesce(jsonb_agg(to_jsonb(z)),'[]') into rows from (select p.id,p.title from public.studio_business_plans x join public.studio_projects p on p.id=x.id and p.workspace_id=x.workspace_id where x.workspace_id=p_workspace and position(q in lower(p.title))>0 order by p.title,p.id limit 50 offset p_page*50) z;
  elsif p_options='members' then
   select count(*) into n from public.workspace_members where workspace_id=p_workspace;
   select coalesce(jsonb_agg(to_jsonb(z)),'[]') into rows from (select m.user_id id,coalesce(p.display_name,'Workspace member') title from public.workspace_members m left join public.profiles p on p.id=m.user_id where m.workspace_id=p_workspace order by m.user_id limit 50 offset p_page*50) z;
  else raise exception 'Invalid options' using errcode='22023'; end if;
  return jsonb_build_object('items',rows,'total',n,'page',p_page,'pageSize',50);
 end if;
 if p_book is null then
  select count(*) into n from public.studio_private_books where workspace_id=p_workspace and position(q in lower(title))>0;
  select coalesce(jsonb_agg(to_jsonb(z)),'[]') into rows from (select *,studio_private_business.access(workspace_id,id,'manage') can_manage,studio_private_business.access(workspace_id,id,'edit') can_edit from public.studio_private_books where workspace_id=p_workspace and position(q in lower(title))>0 order by updated_at desc,id limit 50 offset p_page*50) z;
  return jsonb_build_object('books',rows,'total',n,'page',p_page,'pageSize',50,'asOf',now());
 end if;
 select * into b from public.studio_private_books where workspace_id=p_workspace and id=p_book;
 if b.id is null then raise exception 'Access denied' using errcode='42501'; end if;
 if p_record is not null then
  select * into rec from public.studio_private_records where workspace_id=p_workspace and book_id=p_book and id=p_record;
  if rec.id is null then raise exception 'Record unavailable' using errcode='42501'; end if;
  return jsonb_build_object('record',studio_private_business.record_json(rec),'historyTotal',(select count(*) from public.studio_private_record_history where book_id=p_book and record_id=p_record),'history',coalesce((select jsonb_agg(to_jsonb(z)) from (select * from public.studio_private_record_history where book_id=p_book and record_id=p_record order by revision desc limit 50 offset p_page*50) z),'[]'),'versionsTotal',(select count(*) from public.studio_private_document_versions where book_id=p_book and document_id=p_record),'versions',coalesce((select jsonb_agg(to_jsonb(z)) from (select * from public.studio_private_document_versions where book_id=p_book and document_id=p_record order by ordinal desc limit 50 offset p_page*50) z),'[]'),'approvedSnapshot',(select to_jsonb(a) from public.studio_private_budget_approvals a where a.id=rec.approved_snapshot_id),'documentVersion',(select to_jsonb(v) from public.studio_private_document_versions v where v.id=rec.document_version_id),'page',p_page,'pageSize',50);
 end if;
 select count(*) into n from public.studio_private_records where book_id=p_book and (p_kind='all' or kind=p_kind) and position(q in lower(title||' '||category||' '||counterparty))>0;
 select coalesce(jsonb_agg(studio_private_business.record_json(z)),'[]') into rows from (select * from public.studio_private_records where book_id=p_book and (p_kind='all' or kind=p_kind) and position(q in lower(title||' '||category||' '||counterparty))>0 order by updated_at desc,id limit 50 offset p_page*50) z;
 -- Totals include ALL authorized active records, independently of list pages or search.
 with active as (select * from public.studio_private_records where book_id=p_book and status='active' and amount_minor is not null), currencies as (select distinct currency from active), amounts as (
  select c.currency,
   coalesce((select sum(amount_minor) from active where currency=c.currency and kind='budget'),0) planned,
   coalesce((select sum((a.snapshot->>'amount_minor')::numeric) from active r join public.studio_private_budget_approvals a on a.id=r.approved_snapshot_id where r.currency=c.currency and a.snapshot->>'currency'=c.currency and r.kind='budget'),0) approved,
   coalesce((select sum(amount_minor) from active where currency=c.currency and kind='expense'),0) paid,
   coalesce((select sum(amount_minor) from active where currency=c.currency and kind='income'),0) income,
   coalesce((select sum(greatest(r.amount_minor-coalesce((select sum(e.amount_minor) from active e where e.commitment_id=r.id and e.kind='expense'),0),0)) from active r where r.currency=c.currency and r.kind='commitment'),0) outstanding,
   (select count(*) from active where currency=c.currency) records
  from currencies c)
 select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'planned_minor',planned::text,'approved_minor',approved::text,'paid_minor',paid::text,'income_minor',income::text,'outstanding_minor',outstanding::text,'record_count',records) order by currency),'[]') into totals from amounts;
 return jsonb_build_object('book',to_jsonb(b)||jsonb_build_object('can_manage',studio_private_business.access(p_workspace,p_book,'manage'),'can_edit',studio_private_business.access(p_workspace,p_book,'edit')),'records',rows,'total',n,'page',p_page,'pageSize',50,'totals',totals,'asOf',now(),'lastUpdated',b.updated_at,'plan',(select jsonb_build_object('id',id,'title',title) from public.studio_projects where workspace_id=p_workspace and id=b.plan_id),'grants',coalesce((select jsonb_agg(to_jsonb(g)) from public.studio_private_book_grants g where book_id=p_book),'[]'));
end $$;
revoke all on function public.studio_private_business_read(uuid,uuid,uuid,text,integer,text,text) from public,anon;
grant execute on function public.studio_private_business_read(uuid,uuid,uuid,text,integer,text,text) to authenticated;
commit;
