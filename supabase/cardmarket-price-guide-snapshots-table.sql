-- Cardmarket One Piece daily price snapshots (history by day)
create table if not exists public.cardmarket_price_guide_snapshots (
  snapshot_date date not null,
  entry_key text not null,
  product_id text,
  print_code text,
  card_name text,
  set_code text,
  rarity text,
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
  available integer,
  source_game_id text,
  source_expansion_id text,
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (snapshot_date, entry_key)
);

create index if not exists idx_cardmarket_price_guide_snapshots_entry_key
  on public.cardmarket_price_guide_snapshots (entry_key);

create index if not exists idx_cardmarket_price_guide_snapshots_print_code
  on public.cardmarket_price_guide_snapshots (print_code);

create index if not exists idx_cardmarket_price_guide_snapshots_set_code
  on public.cardmarket_price_guide_snapshots (set_code);

create index if not exists idx_cardmarket_price_guide_snapshots_snapshot_date
  on public.cardmarket_price_guide_snapshots (snapshot_date);

create or replace function public.cardmarket_price_guide_snapshots_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cardmarket_price_guide_snapshots_set_updated_at
on public.cardmarket_price_guide_snapshots;

create trigger trg_cardmarket_price_guide_snapshots_set_updated_at
before update on public.cardmarket_price_guide_snapshots
for each row
execute function public.cardmarket_price_guide_snapshots_set_updated_at();
