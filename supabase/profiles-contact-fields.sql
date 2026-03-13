alter table public.profiles
  add column if not exists postal_code text,
  add column if not exists discord_username text;

alter table public.profiles
  drop constraint if exists profiles_postal_code_format_check;

alter table public.profiles
  add constraint profiles_postal_code_format_check
  check (
    postal_code is null
    or postal_code ~ '^[0-9]{5}$'
  );
