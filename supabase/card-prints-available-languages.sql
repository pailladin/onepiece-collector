alter table public.card_prints
add column if not exists available_languages text[] not null default '{}'::text[];
