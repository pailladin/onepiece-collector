-- Test RLS setup for a public catalogue table.
-- This keeps read access open to anon/authenticated users while making it explicit.

alter table public.card_prints enable row level security;

drop policy if exists "card_prints_select_all" on public.card_prints;
create policy "card_prints_select_all"
on public.card_prints
for select
to anon, authenticated
using (true);
