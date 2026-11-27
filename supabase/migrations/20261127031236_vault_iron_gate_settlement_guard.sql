create or replace function public.vault_sim_freeze(p_week date,p_budget bigint) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer; total_weight numeric; allocated_total bigint; w public.vault_sim_weeks%rowtype;
begin
 if p_week is null or extract(isodow from p_week)<>1 or (p_week+8)::timestamp > now() at time zone 'UTC' or p_budget is null or p_budget not between 1 and 1000000000000 then raise exception 'Invalid completed week or budget'; end if;
 perform pg_advisory_xact_lock(81753,1);
 if exists(select 1 from public.vault_sim_settlements where week_start=p_week) then return false; end if;
 select * into w from public.vault_sim_weeks where week_start=p_week for update;
 if not found or w.available<p_budget or w.reserved<>0 then raise exception 'Unfunded budget or existing reservation'; end if;
 if w.distributed<>0 or not exists(select 1 from public.vault_sim_reconciliation where week_start=p_week and reconciled) then raise exception 'Previously distributed or unreconciled week'; end if;
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

revoke all on function public.vault_sim_freeze(date,bigint) from public,anon,authenticated,service_role;