-- Run before deploying the exchange UI. Existing cards are not offered automatically.
begin;

alter table public.collections
  add column if not exists trade_quantity integer not null default 0;

alter table public.collections drop constraint if exists collections_trade_quantity_check;
alter table public.collections add constraint collections_trade_quantity_check
  check (trade_quantity >= 0 and trade_quantity <= quantity);

-- Covers RPCs, imports and direct quantity updates, including concurrent updates.
create or replace function public.clamp_collection_trade_quantity()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.quantity < old.quantity then
    new.trade_quantity := least(new.trade_quantity, greatest(new.quantity, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists clamp_collection_trade_quantity on public.collections;
create trigger clamp_collection_trade_quantity before update on public.collections
for each row execute function public.clamp_collection_trade_quantity();

create or replace function public.set_collection_trade_quantity(
  p_card_print_id uuid, p_language_code text, p_quantity integer
)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  owned_quantity integer;
  normalized_language text := coalesce(nullif(lower(btrim(p_language_code)), ''), 'unknown');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'Invalid trade quantity'; end if;

  select quantity into owned_quantity from public.collections
  where user_id = auth.uid() and card_print_id = p_card_print_id
    and language_code = normalized_language for update;

  if not found then
    if p_quantity = 0 then return 0; end if;
    raise exception 'Card not owned';
  end if;
  if p_quantity > owned_quantity then raise exception 'Trade quantity exceeds owned quantity'; end if;

  update public.collections set trade_quantity = p_quantity
  where user_id = auth.uid() and card_print_id = p_card_print_id
    and language_code = normalized_language;
  return p_quantity;
end;
$$;

revoke all on function public.set_collection_trade_quantity(uuid, text, integer) from public;
grant execute on function public.set_collection_trade_quantity(uuid, text, integer) to authenticated;
create index if not exists collections_trade_user_idx on public.collections(user_id)
  where trade_quantity > 0;
comment on column public.collections.trade_quantity is
  'Nombre d exemplaires proposes a l echange dans cette langue, sans retrait de la collection.';
notify pgrst, 'reload schema';
commit;
