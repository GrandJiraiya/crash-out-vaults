create table public.vault_farcaster_links (
 user_id uuid primary key references auth.users(id) on delete cascade,
 fid bigint not null unique check(fid>0 and fid<=9007199254740991),
 verified_at timestamptz not null default now()
);
alter table public.vault_farcaster_links enable row level security;
revoke all on public.vault_farcaster_links from public,anon,authenticated;
grant select on public.vault_farcaster_links to authenticated;
grant select,insert on public.vault_farcaster_links to service_role;
create policy vault_read_own_farcaster on public.vault_farcaster_links for select to authenticated using ((select auth.uid())=user_id);
