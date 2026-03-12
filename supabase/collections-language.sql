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

create unique index if not exists collections_user_print_language_idx
on public.collections (user_id, card_print_id, language_code);
