-- Execute this in Supabase SQL editor.
-- This creates username profiles and friend relations, then allows
-- a user to read collection rows from users they added as friends.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) >= 3),
  created_at timestamptz not null default now()
);

create table if not exists public.friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.cardmarket_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  oauth_token text not null,
  oauth_token_secret text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cardmarket_oauth_states (
  request_token text primary key,
  request_token_secret text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

update public.profiles
set username = 'user_' || substring(replace(id::text, '-', '') from 1 for 10)
where username is null
   or char_length(trim(username)) < 3;

alter table public.profiles
  alter column username set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_length_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_length_check
      check (char_length(username) >= 3);
  end if;
end $$;

create unique index if not exists profiles_username_key
  on public.profiles (username);

alter table public.profiles enable row level security;
alter table public.friends enable row level security;
alter table public.cardmarket_accounts enable row level security;
alter table public.cardmarket_oauth_states enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "friends_select_own" on public.friends;
create policy "friends_select_own"
on public.friends
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "friends_insert_own" on public.friends;
create policy "friends_insert_own"
on public.friends
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "friends_delete_own" on public.friends;
create policy "friends_delete_own"
on public.friends
for delete
to authenticated
using (user_id = auth.uid());

-- Needed so /friends/[friendId]/[code] can read friend's quantities.
alter table public.collections enable row level security;

drop policy if exists "collections_select_own_or_friend" on public.collections;
create policy "collections_select_own_or_friend"
on public.collections
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.friends f
    where f.user_id = auth.uid()
      and f.friend_id = collections.user_id
  )
);
