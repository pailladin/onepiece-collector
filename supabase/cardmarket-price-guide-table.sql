-- Cardmarket One Piece price guide table (latest snapshot via daily upsert)
create table if not exists public.cardmarket_price_guide_entries (
  entry_key text primary key,
  product_id text,
  id_category integer,
  print_code text,
  card_name text,
  set_code text,
  rarity text,
  trend_price numeric,
  low_price numeric,
  avg_price numeric,
  avg numeric,
  low numeric,
  trend numeric,
  avg1 numeric,
  avg7 numeric,
  avg30 numeric,
  avg_foil numeric,
  low_foil numeric,
  trend_foil numeric,
  avg1_foil numeric,
  avg7_foil numeric,
  avg30_foil numeric,
  reverse_holo_trend numeric,
  lowex_plus_trend numeric,
  available integer,
  source_game_id text,
  source_expansion_id text,
  currency text not null default 'EUR',
  raw_json jsonb not null,
  last_seen_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cardmarket_price_guide_entries add column if not exists id_category integer;
alter table public.cardmarket_price_guide_entries add column if not exists avg numeric;
alter table public.cardmarket_price_guide_entries add column if not exists low numeric;
alter table public.cardmarket_price_guide_entries add column if not exists trend numeric;
alter table public.cardmarket_price_guide_entries add column if not exists avg1 numeric;
alter table public.cardmarket_price_guide_entries add column if not exists avg7 numeric;
alter table public.cardmarket_price_guide_entries add column if not exists avg30 numeric;
alter table public.cardmarket_price_guide_entries add column if not exists avg_foil numeric;
alter table public.cardmarket_price_guide_entries add column if not exists low_foil numeric;
alter table public.cardmarket_price_guide_entries add column if not exists trend_foil numeric;
alter table public.cardmarket_price_guide_entries add column if not exists avg1_foil numeric;
alter table public.cardmarket_price_guide_entries add column if not exists avg7_foil numeric;
alter table public.cardmarket_price_guide_entries add column if not exists avg30_foil numeric;

create index if not exists idx_cardmarket_price_guide_entries_print_code
  on public.cardmarket_price_guide_entries (print_code);

create index if not exists idx_cardmarket_price_guide_entries_set_code
  on public.cardmarket_price_guide_entries (set_code);

create index if not exists idx_cardmarket_price_guide_entries_last_seen_on
  on public.cardmarket_price_guide_entries (last_seen_on);

create or replace function public.cardmarket_price_guide_entries_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cardmarket_price_guide_entries_set_updated_at
on public.cardmarket_price_guide_entries;

create trigger trg_cardmarket_price_guide_entries_set_updated_at
before update on public.cardmarket_price_guide_entries
for each row
execute function public.cardmarket_price_guide_entries_set_updated_at();
