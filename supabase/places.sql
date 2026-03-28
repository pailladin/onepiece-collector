create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text null,
  image_url text null,
  address_line text null,
  city text null,
  postal_code text null,
  department_code text null,
  country text null default 'France',
  discord_url text null,
  website_url text null,
  google_maps_url text null,
  activities text[] not null default '{}',
  search_text text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists places_is_active_idx on public.places (is_active);
create index if not exists places_slug_idx on public.places (slug);
create index if not exists places_city_idx on public.places (city);
create index if not exists places_postal_code_idx on public.places (postal_code);
create index if not exists places_department_code_idx on public.places (department_code);
create index if not exists places_search_text_idx on public.places (search_text);
