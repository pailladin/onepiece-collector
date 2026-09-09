const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const calls = []
let fail = false
let now = 0
const tables = {
  sets: [{ id: 'set', code: 'OP-01', name: 'First' }, { id: 'empty', code: 'OP02', name: null }],
  card_prints: Array.from({ length: 1001 }, (_, i) => ({
    id: String(i), distribution_set_id: 'set', variant_type: i === 0 ? 'Parallel' : 'normal'
  }))
}
tables.card_prints.push({ id: 'orphan', distribution_set_id: 'missing', variant_type: 'normal' })
const supabase = {
  from(table) {
    assert.ok(table in tables, `Unexpected heavy catalogue query: ${table}`)
    return {
      select(columns) { calls.push({ table, columns }); return this },
      order() { return this },
      async range(from, to) {
        return fail ? { error: { message: 'offline' } } : { data: tables[table].slice(from, to + 1) }
      }
    }
  }
}
const modules = new Map()
function load(name) {
  if (name === '@/lib/server/supabaseServer') return { supabaseServiceServer: supabase }
  if (name === '@/lib/server/authUser') return { getRequestUserId: async () => ({ userId: 'alice' }) }
  if (name === 'next/server') return { NextResponse: { json: (body) => body } }
  if (modules.has(name)) return modules.get(name)
  const filename = path.resolve(__dirname, '../src', name.replace('@/', '') + '.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', code)(load, module, module.exports, { now: () => now })
  modules.set(name, module.exports)
  return module.exports
}

async function main() {
  const { getCollectionStatsCatalogue } = load('@/lib/server/collectionStatsCatalogue')
  const [first, concurrent] = await Promise.all([getCollectionStatsCatalogue(), getCollectionStatsCatalogue()])
  assert.equal(first, concurrent)
  assert.equal(first.prints.length, 1002)
  assert.equal(first.sets[0].code, 'OP01')
  assert.equal(calls.length, 3) // One set page, two print pages, shared by concurrent requests.
  assert.equal(await getCollectionStatsCatalogue(), first)
  assert.equal(calls.length, 3)
  now = 60_001
  fail = true
  await assert.rejects(getCollectionStatsCatalogue(), /offline/)
  fail = false
  assert.notEqual(await getCollectionStatsCatalogue(), first) // A failed refresh can be retried.

  const quantities = load('@/lib/collections/quantities')
  let rows = [
    { card_print_id: '0', quantity: 2, language_code: 'fr' },
    { card_print_id: '0', quantity: 1, language_code: 'en' },
    { card_print_id: '1000', quantity: 1 },
    { card_print_id: '1', quantity: 0 },
    { card_print_id: 'orphan', quantity: 1 }
  ]
  quantities.fetchAllUserCollectionRows = async ({ userId }) => {
    assert.equal(userId, 'alice')
    return rows
  }
  const { GET } = load('@/app/api/collection/stats/route')
  const result = await GET({})
  assert.deepEqual(result.stats.OP01, {
    total: 1001, owned: 2, totalNormal: 1000, ownedNormal: 1,
    totalAlt: 1, ownedAlt: 1, percent: 0, percentNormal: 0, percentAlt: 100
  })
  assert.equal(result.stats.OP02.total, 0)
  assert.equal(result.sets[1].name, 'OP02')
  rows = []
  assert.equal((await GET({})).stats.OP01.owned, 0)
  console.log('PASS: pagination, shared cache, retry, variants, multilingual duplicates, empty sets and fresh ownership.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
