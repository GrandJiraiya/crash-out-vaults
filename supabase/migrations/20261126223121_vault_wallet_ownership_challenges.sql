create table public.vault_wallet_links (
 user_id uuid primary key references auth.users(id) on delete cascade,
 address text not null unique check(address ~ '^0x[0-9a-f]{40}$'),
 chain_id integer not null default 8453 check(chain_id=8453),
 verified_at timestamptz not null default now()
);
alter table public.vault_wallet_links enable row level security;
revoke all on public.vault_wallet_links from public,anon,authenticated;
grant select on public.vault_wallet_links to authenticated;
grant select,insert on public.vault_wallet_links to service_role;
create policy wallet_read_own on public.vault_wallet_links for select to authenticated using ((select auth.uid())=user_id);
create table public.vault_wallet_challenges (
 user_id uuid primary key references auth.users(id) on delete cascade,
 nonce uuid not null unique default gen_random_uuid(),
 address text not null check(address ~ '^0x[0-9a-f]{40}$'),
 origin text not null check(length(origin)<=300),
 issued_at timestamptz not null default now(),
 expires_at timestamptz not null,
 used boolean not null default false
);
alter table public.vault_wallet_challenges enable row level security;
revoke all on public.vault_wallet_challenges from public,anon,authenticated;
grant select,insert,update on public.vault_wallet_challenges to service_role;
create function public.vault_wallet_issue(p_user uuid,p_address text,p_origin text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.vault_wallet_challenges%rowtype;
begin
 if exists(select 1 from public.vault_wallet_links where user_id=p_user) then return null; end if;
 insert into public.vault_wallet_challenges(user_id,address,origin,expires_at)
 values(p_user,p_address,p_origin,now()+interval '5 minutes')
 on conflict(user_id) do update set nonce=gen_random_uuid(),address=excluded.address,origin=excluded.origin,issued_at=now(),expires_at=excluded.expires_at,used=false
 where public.vault_wallet_challenges.issued_at<=now()-interval '30 seconds'
 returning * into c;
 if not found then return null; end if;
 return to_jsonb(c);
end;$$;
create function public.vault_wallet_take(p_user uuid,p_nonce uuid,p_origin text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.vault_wallet_challenges%rowtype;
begin
 update public.vault_wallet_challenges set used=true where user_id=p_user and nonce=p_nonce and origin=p_origin and not used and expires_at>now() returning * into c;
 if not found then return null; end if;
 return to_jsonb(c);
end;$$;
create function public.vault_wallet_finish(p_user uuid,p_nonce uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare c public.vault_wallet_challenges%rowtype;
begin
 select * into c from public.vault_wallet_challenges where user_id=p_user and nonce=p_nonce and used and expires_at>now() for update;
 if not found then return false; end if;
 insert into public.vault_wallet_links(user_id,address) values(p_user,c.address) on conflict do nothing;
 return found;
end;$$;
revoke all on function public.vault_wallet_issue(uuid,text,text),public.vault_wallet_take(uuid,uuid,text),public.vault_wallet_finish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vault_wallet_issue(uuid,text,text),public.vault_wallet_take(uuid,uuid,text),public.vault_wallet_finish(uuid,uuid) to service_role;