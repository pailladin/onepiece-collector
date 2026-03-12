alter table public.sets
add column if not exists available_languages text[] not null default '{}'::text[];
