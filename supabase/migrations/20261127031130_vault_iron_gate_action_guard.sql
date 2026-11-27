create or replace function public.vault_commit_action(p_user uuid,p_expected bigint,p_next jsonb,p_action text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare last_at timestamptz; checked_at timestamptz; current_revision bigint;
begin
 select revision into current_revision from public.vault_player_state where user_id=p_user for update;
 if not found or current_revision<>p_expected then return false; end if;
 checked_at=clock_timestamp();
 if p_next->>'week' is distinct from date_trunc('week',checked_at at time zone 'UTC')::date::text or
 p_next->>'day' is distinct from (checked_at at time zone 'UTC')::date::text then return false; end if;
 if p_action<>'rollover' then
 select created_at into last_at from public.vault_action_log where user_id=p_user and revision=p_expected;
 if last_at is not null and checked_at-last_at<interval '250 milliseconds' then
 raise sqlstate 'PT429' using message='Action rate limit; retry shortly';
 end if;
 end if;
 update public.vault_player_state set revision=p_expected+1,state=p_next,updated_at=checked_at where user_id=p_user and revision=p_expected;
 insert into public.vault_action_log(user_id,revision,action,created_at) values(p_user,p_expected+1,p_action,checked_at);
 return true;
end;$$;
revoke all on function public.vault_commit_action(uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.vault_commit_action(uuid,bigint,jsonb,text) to service_role;