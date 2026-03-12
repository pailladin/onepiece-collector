alter table public.collections
add column if not exists language_code text;

update public.collections
set language_code = 'unknown'
where language_code is null or btrim(language_code) = '';

alter table public.collections
alter column language_code set default 'unknown';

alter table public.collections
alter column language_code set not null;

do $$
declare
  pk_name text;
begin
  select con.conname
  into pk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'collections'
    and con.contype = 'p'
    and pg_get_constraintdef(con.oid) like '%user_id%'
    and pg_get_constraintdef(con.oid) like '%card_print_id%'
    and pg_get_constraintdef(con.oid) not like '%language_code%';

  if pk_name is not null then
    execute format('alter table public.collections drop constraint %I', pk_name);
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'collections'
      and con.contype = 'u'
      and pg_get_constraintdef(con.oid) like '%user_id%'
      and pg_get_constraintdef(con.oid) like '%card_print_id%'
      and pg_get_constraintdef(con.oid) not like '%language_code%'
  loop
    execute format('alter table public.collections drop constraint %I', constraint_name);
  end loop;
end $$;

do $$
declare
  index_name text;
begin
  for index_name in
    select idx.indexname
    from pg_indexes idx
    left join pg_constraint con
      on con.conindid = to_regclass(format('%I.%I', idx.schemaname, idx.indexname))
    where idx.schemaname = 'public'
      and idx.tablename = 'collections'
      and idx.indexdef like '%UNIQUE INDEX%'
      and idx.indexdef like '%(user_id, card_print_id)%'
      and idx.indexdef not like '%language_code%'
      and con.oid is null
  loop
    execute format('drop index if exists public.%I', index_name);
  end loop;
end $$;

alter table public.collections
add constraint collections_pkey
primary key (user_id, card_print_id, language_code);
