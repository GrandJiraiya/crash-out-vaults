-- SIMULATION ONLY. No real currencies, wallet addresses or on-chain claims.
create table public.vault_sim_weeks (
 week_start date primary key check(extract(isodow from week_start)=1),
 funded bigint not null default 0 check(funded between 0 and 1000000000000),
 available bigint not null default 0 check(available>=0),
 reserved bigint not null default 0 check(reserved>=0),
 distributed bigint not null default 0 check(distributed>=0),
 updated_at timestamptz not null default now(),
 check(funded=available+reserved+distributed)
);
create table public.vault_sim_ledger (
 event_id uuid primary key,
 week_start date not null references public.vault_sim_weeks(week_start),
 kind text not null check(kind in ('fund','reserve','distribute','release')),
 units bigint not null check(units between 1 and 1000000000000),
 created_at timestamptz not null default now()
);
create index vault_sim_ledger_week_idx on public.vault_sim_ledger(week_start);
alter table public.vault_sim_weeks enable row level security;
alter table public.vault_sim_ledger enable row level security;
revoke all on public.vault_sim_weeks,public.vault_sim_ledger from public,anon,authenticated,service_role;
grant select on public.vault_sim_weeks to authenticated,service_role;
grant select on public.vault_sim_ledger to service_role;
create policy vault_sim_read_totals on public.vault_sim_weeks for select to authenticated using (auth.uid() is not null and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false);
-- Only the database administrator can post. No browser or Edge write endpoint.
create function public.vault_sim_post(p_event uuid,p_week date,p_kind text,p_units bigint) returns boolean
language plpgsql security invoker set search_path='' as $$
declare prior public.vault_sim_ledger%rowtype; w public.vault_sim_weeks%rowtype;
begin
 if p_event is null or p_week is null or extract(isodow from p_week)<>1 or p_kind is null or p_kind not in ('fund','reserve','distribute','release') or p_units is null or p_units not between 1 and 1000000000000 then raise exception 'Invalid simulated ledger event'; end if;
 perform pg_advisory_xact_lock(81753,1);
 select * into prior from public.vault_sim_ledger where event_id=p_event;
 if found then
  if prior.week_start=p_week and prior.kind=p_kind and prior.units=p_units then return false; end if;
  raise exception 'Event ID conflict';
 end if;
 insert into public.vault_sim_weeks(week_start) values(p_week) on conflict do nothing;
 select * into strict w from public.vault_sim_weeks where week_start=p_week for update;
 if p_kind='fund' then w.funded=w.funded+p_units; w.available=w.available+p_units;
 elsif p_kind='reserve' then
  if w.available<p_units then raise exception 'Insufficient simulated available units'; end if;
  w.available=w.available-p_units; w.reserved=w.reserved+p_units;
 elsif p_kind='distribute' then
  if w.reserved<p_units then raise exception 'Insufficient simulated reserved units'; end if;
  w.reserved=w.reserved-p_units; w.distributed=w.distributed+p_units;
 else
  if w.reserved<p_units then raise exception 'Insufficient simulated reserved units'; end if;
  w.reserved=w.reserved-p_units; w.available=w.available+p_units;
 end if;
 update public.vault_sim_weeks set funded=w.funded,available=w.available,reserved=w.reserved,distributed=w.distributed,updated_at=now() where week_start=p_week;
 insert into public.vault_sim_ledger(event_id,week_start,kind,units) values(p_event,p_week,p_kind,p_units);
 return true;
end;$$;
revoke all on function public.vault_sim_post(uuid,date,text,bigint) from public,anon,authenticated,service_role;
create view public.vault_sim_reconciliation with (security_invoker=true) as
select w.week_start,w.funded,w.available,w.reserved,w.distributed,
 coalesce(l.funded,0) as ledger_funded,coalesce(l.available,0) as ledger_available,
 coalesce(l.reserved,0) as ledger_reserved,coalesce(l.distributed,0) as ledger_distributed,
 (w.funded=coalesce(l.funded,0) and w.available=coalesce(l.available,0) and w.reserved=coalesce(l.reserved,0) and w.distributed=coalesce(l.distributed,0)) as reconciled
from public.vault_sim_weeks w left join (
 select week_start,sum(case when kind='fund' then units else 0 end) funded,
 sum(case when kind in ('fund','release') then units when kind='reserve' then -units else 0 end) available,
 sum(case when kind='reserve' then units when kind in ('distribute','release') then -units else 0 end) reserved,
 sum(case when kind='distribute' then units else 0 end) distributed
 from public.vault_sim_ledger group by week_start
) l using(week_start);
revoke all on public.vault_sim_reconciliation from public,anon,authenticated,service_role;
grant select on public.vault_sim_reconciliation to service_role;