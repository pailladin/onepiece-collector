-- Cardmarket catalog entries synced from products_singles_18.json
create table if not exists public.cardmarket_catalog_entries (
  product_id text primary key,
  name text,
  id_category integer,
  category_name text,
  id_expansion integer,
  id_metacard integer,
  date_added text,
  raw_json jsonb not null,
  last_seen_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cardmarket_catalog_entries_name
  on public.cardmarket_catalog_entries (name);

create index if not exists idx_cardmarket_catalog_entries_id_expansion
  on public.cardmarket_catalog_entries (id_expansion);

create index if not exists idx_cardmarket_catalog_entries_last_seen_on
  on public.cardmarket_catalog_entries (last_seen_on);

create or replace function public.cardmarket_catalog_entries_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cardmarket_catalog_entries_set_updated_at
on public.cardmarket_catalog_entries;

create trigger trg_cardmarket_catalog_entries_set_updated_at
before update on public.cardmarket_catalog_entries
for each row
execute function public.cardmarket_catalog_entries_set_updated_at();
