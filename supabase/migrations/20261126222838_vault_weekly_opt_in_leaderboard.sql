create table public.vault_weekly_scores (
 user_id uuid not null references public.vault_player_state(user_id) on delete cascade,
 week_start date not null check (extract(isodow from week_start)=1),
 alias uuid not null default gen_random_uuid() unique,
 hero text not null check(hero in ('Paladin','Assassin','Warlock')),
 points bigint not null check(points>=0),
 level bigint not null check(level>=1),
 listed boolean not null default false,
 primary key(user_id,week_start)
);
alter table public.vault_weekly_scores enable row level security;
revoke all on public.vault_weekly_scores from public,anon,authenticated;
grant select,insert,update on public.vault_weekly_scores to service_role;
create index vault_weekly_scores_rank_idx on public.vault_weekly_scores(week_start,points desc,alias) where listed and points>0;
create function public.vault_sync_weekly_score() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.state->>'hero' is null then return new; end if;
 insert into public.vault_weekly_scores(user_id,week_start,hero,points,level)
 values(new.user_id,(new.state->>'week')::date,new.state->>'hero',(new.state->>'points')::bigint,1+(new.state->>'xp')::bigint/100)
 on conflict(user_id,week_start) do update set hero=excluded.hero,points=excluded.points,level=excluded.level;
 return new;
end;
$$;
revoke all on function public.vault_sync_weekly_score() from public,anon,authenticated;
grant execute on function public.vault_sync_weekly_score() to service_role;
create trigger vault_sync_weekly_score after insert or update of state on public.vault_player_state
for each row execute function public.vault_sync_weekly_score();
insert into public.vault_weekly_scores(user_id,week_start,hero,points,level)
 select user_id,(state->>'week')::date,state->>'hero',(state->>'points')::bigint,1+(state->>'xp')::bigint/100
 from public.vault_player_state where state->>'hero' is not null
 on conflict(user_id,week_start) do nothing;
create function public.vault_set_listing(p_user uuid,p_listed boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.vault_weekly_scores set listed=p_listed where user_id=p_user
 and week_start=date_trunc('week',now() at time zone 'UTC')::date;
 return found;
end;
$$;
revoke all on function public.vault_set_listing(uuid,boolean) from public,anon,authenticated;
grant execute on function public.vault_set_listing(uuid,boolean) to service_role;
create function public.vault_get_leaderboard(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with period as (select date_trunc('week',now() at time zone 'UTC')::date as week),
 ranked as (select rank() over(order by points desc) as rank,alias,hero,points,level,user_id
 from public.vault_weekly_scores where week_start=(select week from period) and listed and points>0),
 top_rows as (select rank,alias,hero,points,level from ranked order by rank,alias limit 50)
 select jsonb_build_object('week',(select week from period),'entries',coalesce((select jsonb_agg(to_jsonb(t) order by t.rank,t.alias) from top_rows t),'[]'::jsonb),
 'mine',(select jsonb_build_object('alias',s.alias,'listed',s.listed,'points',s.points,'rank',(select rank from ranked where user_id=p_user)) from public.vault_weekly_scores s where s.user_id=p_user and s.week_start=(select week from period)))
$$;
revoke all on function public.vault_get_leaderboard(uuid) from public,anon,authenticated;
grant execute on function public.vault_get_leaderboard(uuid) to service_role;