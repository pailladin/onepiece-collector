create table if not exists public.community_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 800),
  is_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.community_chat_messages
  add column if not exists is_admin boolean not null default false;

create index if not exists community_chat_messages_created_at_idx
  on public.community_chat_messages (created_at asc);

alter table public.community_chat_messages enable row level security;

drop policy if exists "community_chat_messages_select_authenticated" on public.community_chat_messages;
create policy "community_chat_messages_select_authenticated"
on public.community_chat_messages
for select
to authenticated
using (true);

drop policy if exists "community_chat_messages_insert_own" on public.community_chat_messages;
create policy "community_chat_messages_insert_own"
on public.community_chat_messages
for insert
to authenticated
with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.community_chat_messages;
