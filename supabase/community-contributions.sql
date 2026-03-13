create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.community_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_type text not null,
  target_type text not null,
  target_id text null,
  title text not null,
  message text null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  admin_comment text null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (submission_type in ('card_edit', 'card_add')),
  check (target_type in ('card_print', 'new_card')),
  check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists community_submissions_user_id_idx
  on public.community_submissions (user_id);

create index if not exists community_submissions_status_idx
  on public.community_submissions (status);

create index if not exists community_submissions_created_at_idx
  on public.community_submissions (created_at desc);

create table if not exists public.contributor_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points integer not null default 0,
  approved_count integer not null default 0,
  rejected_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contributor_scores_points_idx
  on public.contributor_scores (points desc, approved_count desc);

drop trigger if exists trg_community_submissions_updated_at on public.community_submissions;
create trigger trg_community_submissions_updated_at
before update on public.community_submissions
for each row
execute function public.set_updated_at();

drop trigger if exists trg_contributor_scores_updated_at on public.contributor_scores;
create trigger trg_contributor_scores_updated_at
before update on public.contributor_scores
for each row
execute function public.set_updated_at();

alter table public.community_submissions enable row level security;
alter table public.contributor_scores enable row level security;

drop policy if exists "community_submissions_select_own" on public.community_submissions;
create policy "community_submissions_select_own"
on public.community_submissions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "community_submissions_insert_own" on public.community_submissions;
create policy "community_submissions_insert_own"
on public.community_submissions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists "contributor_scores_select_all" on public.contributor_scores;
create policy "contributor_scores_select_all"
on public.contributor_scores
for select
to authenticated
using (true);
