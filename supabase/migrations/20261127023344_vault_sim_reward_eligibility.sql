-- Fictional simulation units only. No tokens or payment eligibility.
create table public.vault_sim_settlements (
 week_start date primary key references public.vault_sim_weeks(week_start),
 budget bigint not null check(budget>0),
 allocated bigint not null check(allocated>0 and allocated<=budget),
 eligible_count integer not null check(eligible_count between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','distributed','cancelled')),
 frozen_at timestamptz not null default now(),
 resolved_at timestamptz,
 check((status='pending')=(resolved_at is null))
);
create table public.vault_sim_allocations (
 week_start date not null references public.vault_sim_settlements(week_start),
 user_id uuid not null,
 points bigint not null check(points>=100),
 weight bigint not null check(weight=least(points,1000)),
 units bigint not null check(units>=0),
 primary key(week_start,user_id)
);
create index vault_sim_allocations_user_idx on public.vault_sim_allocations(user_id,week_start desc);
alter table public.vault_sim_settlements enable row level security;
alter table public.vault_sim_allocations enable row level security;
revoke all on public.vault_sim_settlements,public.vault_sim_allocations from public,anon,authenticated,service_role;
grant select on public.vault_sim_settlements,public.vault_sim_allocations to authenticated,service_role;
create policy sim_settlement_read on public.vault_sim_settlements for select to authenticated using (auth.uid() is not null and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false);
create policy sim_allocation_own on public.vault_sim_allocations for select to authenticated using ((select auth.uid())=user_id and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false);
create function public.vault_sim_freeze(p_week date,p_budget bigint) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer; total_weight numeric; allocated_total bigint; w public.vault_sim_weeks%rowtype;
begin
 if p_week is null or extract(isodow from p_week)<>1 or (p_week+8)::timestamp > now() at time zone 'UTC' or p_budget is null or p_budget not between 1 and 1000000000000 then raise exception 'Invalid completed week or budget'; end if;
 perform pg_advisory_xact_lock(81753,1);
 if exists(select 1 from public.vault_sim_settlements where week_start=p_week) then return false; end if;
 select * into w from public.vault_sim_weeks where week_start=p_week for update;
 if not found or w.available<p_budget or w.reserved<>0 then raise exception 'Unfunded budget or existing reservation'; end if;
 lock table public.vault_weekly_scores,public.vault_wallet_links in share mode;
 select count(*),coalesce(sum(least(s.points,1000)),0) into n,total_weight
 from public.vault_weekly_scores s join public.vault_wallet_links l using(user_id)
 where s.week_start=p_week and s.listed and s.points>=100 and l.chain_id=8453 and l.verified_at<(p_week+7)::timestamp at time zone 'UTC';
 if n<1 or n>1000 then raise exception 'Unsupported eligible player count'; end if;
 select sum(floor(p_budget::numeric*least(s.points,1000)/total_weight))::bigint into allocated_total
 from public.vault_weekly_scores s join public.vault_wallet_links l using(user_id)
 where s.week_start=p_week and s.listed and s.points>=100 and l.chain_id=8453 and l.verified_at<(p_week+7)::timestamp at time zone 'UTC';
 if allocated_total<=0 then raise exception 'Budget too small'; end if;
 insert into public.vault_sim_settlements(week_start,budget,allocated,eligible_count) values(p_week,p_budget,allocated_total,n);
 insert into public.vault_sim_allocations(week_start,user_id,points,weight,units)
 select p_week,s.user_id,s.points,least(s.points,1000),floor(p_budget::numeric*least(s.points,1000)/total_weight)::bigint
 from public.vault_weekly_scores s join public.vault_wallet_links l using(user_id)
 where s.week_start=p_week and s.listed and s.points>=100 and l.chain_id=8453 and l.verified_at<(p_week+7)::timestamp at time zone 'UTC';
 perform public.vault_sim_post(gen_random_uuid(),p_week,'reserve',allocated_total);
 return true;
end;$$;
create function public.vault_sim_resolve(p_week date,p_approve boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
declare s public.vault_sim_settlements%rowtype; w public.vault_sim_weeks%rowtype; n bigint; units bigint;
begin
 if p_approve is null then raise exception 'Approval decision required'; end if;
 perform pg_advisory_xact_lock(81753,1);
 select * into s from public.vault_sim_settlements where week_start=p_week for update;
 if not found or s.status<>'pending' then return false; end if;
 select * into strict w from public.vault_sim_weeks where week_start=p_week for update;
 select count(*),coalesce(sum(a.units),0) into n,units from public.vault_sim_allocations a where a.week_start=p_week;
 if n<>s.eligible_count or units<>s.allocated or w.reserved<>s.allocated or not exists(select 1 from public.vault_sim_reconciliation where week_start=p_week and reconciled) then raise exception 'Settlement reconciliation mismatch'; end if;
 perform public.vault_sim_post(gen_random_uuid(),p_week,case when p_approve then 'distribute' else 'release' end,s.allocated);
 update public.vault_sim_settlements set status=case when p_approve then 'distributed' else 'cancelled' end,resolved_at=now() where week_start=p_week;
 return true;
end;$$;
revoke all on function public.vault_sim_freeze(date,bigint),public.vault_sim_resolve(date,boolean) from public,anon,authenticated,service_role;