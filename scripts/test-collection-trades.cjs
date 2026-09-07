// Isolated PostgreSQL tests. Setup: npm install --prefix .next/trade-tests --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
const { PGlite } = require('../.next/trade-tests/node_modules/@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const { resolve } = require('node:path')

async function main() {
  const db = await PGlite.create()
  const sql = name => readFileSync(resolve(__dirname, '../supabase', name), 'utf8')
  const alice = '00000000-0000-0000-0000-000000000001'
  const bob = '00000000-0000-0000-0000-000000000002'
  const card = '00000000-0000-0000-0000-000000000003'
  const otherCard = '00000000-0000-0000-0000-000000000004'
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated;
      create table public.collections (user_id uuid not null, card_print_id uuid not null,
        language_code text not null, quantity integer not null check(quantity >= 0),
        primary key(user_id,card_print_id,language_code));
      create table public.friends(user_id uuid, friend_id uuid);
      grant select,insert,update,delete on public.collections to authenticated;
      grant select on public.friends to authenticated;
      insert into public.collections values
        ('${alice}','${card}','fr',3), ('${alice}','${card}','en',1),
        ('${bob}','${otherCard}','fr',2);
    `)
    await db.exec(sql('collections-rls.sql'))
    await db.exec(sql('collection-quantity-rpc.sql'))
    await db.exec(sql('collection-trades.sql'))
    await db.exec(sql('collection-trades.sql'))
    assert.ok((await db.query('select trade_quantity from collections')).rows.every(row => row.trade_quantity === 0))
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`)
    const offer = (quantity, language = 'fr', print = card) => db.query(
      'select set_collection_trade_quantity($1,$2,$3) as quantity', [print, language, quantity])
    const change = delta => db.query('select change_collection_quantity($1,$2,$3)', [card, 'fr', delta])
    const owned = async () => (await db.query('select quantity,trade_quantity from collections where card_print_id=$1 and language_code=$2', [card, 'fr'])).rows[0]

    await offer(2, ' FR ')
    assert.deepEqual(await owned(), { quantity: 3, trade_quantity: 2 })
    await offer(1, 'en') // Offering your only copy is allowed; languages are independent.
    await assert.rejects(offer(4), /exceeds owned/)
    await assert.rejects(offer(-1), /Invalid trade quantity/)
    await assert.rejects(offer(null), /Invalid trade quantity/)
    await assert.rejects(offer(1, 'jp'), /Card not owned/)
    await assert.rejects(offer(1, 'fr', otherCard), /Card not owned/)
    await assert.rejects(db.query('update collections set trade_quantity=9 where card_print_id=$1', [card]), /check constraint/)
    assert.equal((await db.query('update collections set trade_quantity=1 where user_id=$1', [bob])).affectedRows, 0)
    await change(1)
    assert.deepEqual(await owned(), { quantity: 4, trade_quantity: 2 })
    await change(-3)
    assert.deepEqual(await owned(), { quantity: 1, trade_quantity: 1 })
    await offer(0)
    assert.deepEqual(await owned(), { quantity: 1, trade_quantity: 0 })
    await offer(1)
    await change(-1)
    assert.equal(await owned(), undefined)
    await offer(0) // Idempotent removal after the collection row was deleted.
    await change(2)
    assert.deepEqual(await owned(), { quantity: 2, trade_quantity: 0 })
    await offer(2)
    await db.query('update collections set quantity=1 where card_print_id=$1 and language_code=$2', [card, 'fr'])
    assert.deepEqual(await owned(), { quantity: 1, trade_quantity: 1 })
    await db.exec("set request.jwt.claim.sub = ''")
    await assert.rejects(offer(1), /Authentication required/)
    console.log('PASS: migration rerun, default zero, language isolation, ownership/RLS, invalid quantities, clamping, deletion, re-addition and direct updates.')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
