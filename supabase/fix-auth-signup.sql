-- Run this in Supabase SQL editor.
-- Fixes "Database error saving user" on sign-up caused by a fragile
-- auth.users -> public.profiles trigger (missing/invalid username).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) >= 3),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

create or replace function public.build_profile_username(
  p_email text,
  p_meta jsonb,
  p_uid uuid
)
returns text
language plpgsql
as $$
declare
  raw_username text;
  local_part text;
  base text;
  uid_suffix text;
begin
  raw_username := coalesce(
    nullif(trim(p_meta ->> 'username'), ''),
    nullif(trim(p_meta ->> 'user_name'), ''),
    nullif(trim(p_meta ->> 'display_name'), '')
  );

  if raw_username is null then
    local_part := split_part(coalesce(p_email, ''), '@', 1);
    raw_username := nullif(trim(local_part), '');
  end if;

  if raw_username is null then
    raw_username := 'user';
  end if;

  base := lower(regexp_replace(raw_username, '[^a-z0-9_]+', '', 'g'));
  if char_length(base) < 3 then
    base := 'user';
  end if;

  uid_suffix := substring(replace(p_uid::text, '-', '') from 1 for 8);
  return base || '_' || uid_suffix;
end;
$$;

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_username text;
begin
  resolved_username := public.build_profile_username(
    new.email,
    new.raw_user_meta_data,
    new.id
  );

  insert into public.profiles (id, username)
  values (new.id, resolved_username)
  on conflict (id) do update
    set username = excluded.username;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists handle_new_user on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_auth_user_created();

update public.profiles p
set username = public.build_profile_username(u.email, u.raw_user_meta_data, u.id)
from auth.users u
where p.id = u.id
  and (
    p.username is null
    or char_length(trim(p.username)) < 3
  );

insert into public.profiles (id, username)
select
  u.id,
  public.build_profile_username(u.email, u.raw_user_meta_data, u.id)
from auth.users u
left join public.profiles p
  on p.id = u.id
where p.id is null;

alter table public.profiles
  alter column username set not null;

