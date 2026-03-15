create table if not exists public.wishlists (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_print_id uuid not null references public.card_prints(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, card_print_id)
);

create index if not exists wishlists_user_id_idx
  on public.wishlists (user_id);

create index if not exists wishlists_card_print_id_idx
  on public.wishlists (card_print_id);

alter table public.wishlists enable row level security;

drop policy if exists "wishlists_select_own" on public.wishlists;
create policy "wishlists_select_own"
on public.wishlists
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "wishlists_insert_own" on public.wishlists;
create policy "wishlists_insert_own"
on public.wishlists
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "wishlists_delete_own" on public.wishlists;
create policy "wishlists_delete_own"
on public.wishlists
for delete
to authenticated
using (user_id = auth.uid());

