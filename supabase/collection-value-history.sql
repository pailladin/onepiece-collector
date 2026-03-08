-- Weekly collection value snapshots per user and set.
create table if not exists public.collection_value_history (
  id bigserial primary key,
  user_id uuid not null,
  period_start date not null,
  period_end date not null,
  set_code text not null,
  set_name text not null,
  is_total boolean not null default false,
  total_value numeric not null default 0,
  priced_count integer not null default 0,
  expected_count integer not null default 0,
  us_fallback_count integer not null default 0,
  currency text not null default 'USD',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start, set_code)
);

create index if not exists idx_collection_value_history_user_week
  on public.collection_value_history (user_id, period_start desc);

create index if not exists idx_collection_value_history_week
  on public.collection_value_history (period_start desc);

create or replace function public.collection_value_history_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_collection_value_history_set_updated_at
on public.collection_value_history;

create trigger trg_collection_value_history_set_updated_at
before update on public.collection_value_history
for each row
execute function public.collection_value_history_set_updated_at();
