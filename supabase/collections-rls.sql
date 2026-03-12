alter table public.collections enable row level security;

drop policy if exists "collections_select_own_or_friend" on public.collections;
create policy "collections_select_own_or_friend"
on public.collections
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.friends f
    where f.user_id = auth.uid()
      and f.friend_id = collections.user_id
  )
);

drop policy if exists "collections_insert_own" on public.collections;
create policy "collections_insert_own"
on public.collections
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "collections_update_own" on public.collections;
create policy "collections_update_own"
on public.collections
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "collections_delete_own" on public.collections;
create policy "collections_delete_own"
on public.collections
for delete
to authenticated
using (user_id = auth.uid());
