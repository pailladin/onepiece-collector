-- Manual/assisted mapping between local card prints and Cardmarket products
create table if not exists public.cardmarket_print_links (
  id bigint generated always as identity primary key,
  card_print_id uuid not null unique references public.card_prints(id) on delete cascade,
  cardmarket_product_id text not null unique,
  source text not null default 'manual',
  confidence smallint not null default 100 check (confidence between 0 and 100),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cardmarket_print_links_product_id
  on public.cardmarket_print_links (cardmarket_product_id);

create or replace function public.cardmarket_print_links_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cardmarket_print_links_set_updated_at
on public.cardmarket_print_links;

create trigger trg_cardmarket_print_links_set_updated_at
before update on public.cardmarket_print_links
for each row
execute function public.cardmarket_print_links_set_updated_at();
