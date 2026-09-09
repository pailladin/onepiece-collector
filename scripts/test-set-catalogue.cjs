const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')

const calls = []
let fail = false
const prints = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), print_code: String(i) }))
const supabaseServiceServer = {
  from(table) {
    const call = { table }
    calls.push(call)
    return {
      select(columns) { call.columns = columns; return this },
      eq(column, value) { call.filter = [column, value]; return this },
      order() { return this },
      async range(from, to) {
        if (fail) return { error: { message: 'offline' } }
        if (table === 'sets') return { data: [{ id: 'op09', code: 'OP-09', name: 'OP09' }] }
        assert.deepEqual(call.filter, ['distribution_set_id', 'op09'])
        return { data: prints.slice(from, to + 1) }
      }
    }
  }
}
const filename = path.resolve(__dirname, '../src/lib/server/setCatalogue.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText
const mod = { exports: {} }
let now = 0
new Function('require', 'module', 'exports', 'Date', code)(
  () => ({ supabaseServiceServer }), mod, mod.exports, { now: () => now }
)

async function main() {
  const { getSetCatalogue } = mod.exports
  const [first, second] = await Promise.all([getSetCatalogue('OP09'), getSetCatalogue('OP09')])
  assert.equal(first, second)
  assert.equal(first.items.length, 1001)
  assert.equal(first.set.code, 'OP09')
  assert.deepEqual(first.set.availableLanguages, [])
  assert.equal(calls.length, 3)
  assert.equal(await getSetCatalogue('OP09'), first)
  assert.equal(calls.length, 3)
  assert.equal(await getSetCatalogue('UNKNOWN'), null)
  assert.equal(calls.length, 4) // Unknown sets never query card prints.
  now = 60_001
  fail = true
  await assert.rejects(getSetCatalogue('OP09'), /offline/)
  fail = false
  assert.notEqual(await getSetCatalogue('OP09'), first)
  console.log('PASS: scoped queries, pagination, normalized codes, shared cache, expiry, unknown set and retry.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
