create or replace function public.change_collection_quantity(
  p_card_print_id uuid,
  p_language_code text,
  p_delta integer
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_quantity integer;
  normalized_language text := coalesce(nullif(lower(btrim(p_language_code)), ''), 'unknown');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_delta = 0 then
    select quantity
    into next_quantity
    from public.collections
    where user_id = auth.uid()
      and card_print_id = p_card_print_id
      and language_code = normalized_language;
    return coalesce(next_quantity, 0);
  end if;

  if p_delta > 0 then
    insert into public.collections (user_id, card_print_id, language_code, quantity)
    values (auth.uid(), p_card_print_id, normalized_language, p_delta)
    on conflict (user_id, card_print_id, language_code)
    do update set quantity = public.collections.quantity + excluded.quantity
    returning quantity into next_quantity;
    return next_quantity;
  end if;

  -- Lock before deciding between UPDATE and DELETE so concurrent changes
  -- use the latest quantity. Never write zero: some schemas require quantity > 0.
  select quantity into next_quantity
  from public.collections
  where user_id = auth.uid()
    and card_print_id = p_card_print_id
    and language_code = normalized_language
  for update;

  if not found then
    return 0;
  end if;

  next_quantity := greatest(next_quantity + p_delta, 0);
  if next_quantity = 0 then
    delete from public.collections
    where user_id = auth.uid()
      and card_print_id = p_card_print_id
      and language_code = normalized_language;
    return 0;
  end if;

  update public.collections
  set quantity = next_quantity
  where user_id = auth.uid()
    and card_print_id = p_card_print_id
    and language_code = normalized_language;

  return next_quantity;
end;
$$;

revoke all on function public.change_collection_quantity(uuid, text, integer) from public;
grant execute on function public.change_collection_quantity(uuid, text, integer) to authenticated;

comment on function public.change_collection_quantity(uuid, text, integer) is
  'Modifie atomiquement une quantite de collection pour l utilisateur connecte.';
