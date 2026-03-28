create table if not exists public.don_import_overrides (
  id bigint generated always as identity primary key,
  external_id text not null unique,
  card_name text not null default '',
  optcg_don_name text not null default '',
  suggested_set_code text null,
  target_set_code text null,
  is_validated boolean not null default false,
  notes text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists don_import_overrides_target_set_code_idx
  on public.don_import_overrides (target_set_code);

create index if not exists don_import_overrides_validated_idx
  on public.don_import_overrides (is_validated);
