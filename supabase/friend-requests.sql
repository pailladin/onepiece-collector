create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz null,
  check (requester_id <> recipient_id),
  check (status in ('pending', 'accepted', 'declined', 'cancelled'))
);

create unique index if not exists friend_requests_pending_unique_pair
  on public.friend_requests (requester_id, recipient_id)
  where status = 'pending';

insert into public.friends (user_id, friend_id)
select f.friend_id, f.user_id
from public.friends f
where not exists (
  select 1
  from public.friends reverse_f
  where reverse_f.user_id = f.friend_id
    and reverse_f.friend_id = f.user_id
);

alter table public.friend_requests enable row level security;

drop policy if exists "friend_requests_select_own" on public.friend_requests;
create policy "friend_requests_select_own"
on public.friend_requests
for select
to authenticated
using (
  requester_id = auth.uid()
  or recipient_id = auth.uid()
);

drop policy if exists "friend_requests_insert_own" on public.friend_requests;
create policy "friend_requests_insert_own"
on public.friend_requests
for insert
to authenticated
with check (
  requester_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "friend_requests_update_recipient_or_requester" on public.friend_requests;
create policy "friend_requests_update_recipient_or_requester"
on public.friend_requests
for update
to authenticated
using (
  requester_id = auth.uid()
  or recipient_id = auth.uid()
)
with check (
  requester_id = auth.uid()
  or recipient_id = auth.uid()
);
