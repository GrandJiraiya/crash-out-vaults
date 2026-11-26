create table public.vault_player_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now(),
  check (state ? 'revision' and jsonb_typeof(state->'revision') = 'number'
    and state->'revision' = to_jsonb(revision))
);
alter table public.vault_player_state enable row level security;
revoke all on public.vault_player_state from public, anon, authenticated;
grant select on public.vault_player_state to authenticated;
grant select, insert, update on public.vault_player_state to service_role;
create policy vault_read_own on public.vault_player_state for select
  to authenticated using ((select auth.uid()) = user_id);

create table public.vault_action_log (
  user_id uuid not null references public.vault_player_state(user_id) on delete cascade,
  revision bigint not null check (revision > 0),
  action text not null check (action in ('choose','dungeon','raid','attack','skill','heal','equip','quest','vault','rollover')),
  created_at timestamptz not null default now(),
  primary key (user_id, revision)
);
alter table public.vault_action_log enable row level security;
revoke all on public.vault_action_log from public, anon, authenticated;
grant select, insert on public.vault_action_log to service_role;

-- Trusted API must verify the user's access token, load the current state,
-- and calculate the next state via the authoritative engine. Never forward
-- browser-supplied state. Compare-and-swap and audit insert are atomic.
create function public.vault_commit_action(
  p_user uuid, p_expected bigint, p_next jsonb, p_action text
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.vault_player_state
    set revision = p_expected + 1, state = p_next, updated_at = now()
    where user_id = p_user and revision = p_expected;
  if not found then return false; end if;
  insert into public.vault_action_log(user_id, revision, action)
    values(p_user, p_expected + 1, p_action);
  return true;
end;
$$;
revoke all on function public.vault_commit_action(uuid,bigint,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.vault_commit_action(uuid,bigint,jsonb,text) to service_role;
