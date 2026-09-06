alter table public.profiles
  add column if not exists last_card_added_at timestamptz;

create or replace function public.track_last_card_added_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    (tg_op = 'INSERT' and coalesce(new.quantity, 0) > 0)
    or
    (tg_op = 'UPDATE' and coalesce(new.quantity, 0) > coalesce(old.quantity, 0))
  then
    update public.profiles
    set last_card_added_at = now()
    where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_collections_last_card_added_at on public.collections;

create trigger trg_collections_last_card_added_at
after insert or update of quantity on public.collections
for each row
execute function public.track_last_card_added_at();

comment on column public.profiles.last_card_added_at is
  'Date du dernier ajout ou de la derniere augmentation de quantite dans la collection.';
