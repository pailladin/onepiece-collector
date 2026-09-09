const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const rows = []
for (const year of [2020, 2026]) {
  for (let week = 0; week < 52; week++) {
    const date = new Date(Date.UTC(year, 0, 4 + week * 7)).toISOString().slice(0, 10)
    for (let set = 0; set < 30; set++) rows.push({
      user_id: 'alice', period_start: date, period_end: date,
      set_code: set === 0 ? 'TOTAL' : `OP${set}`, set_name: 'Test',
      is_total: set === 0, total_value: 100 + week, expected_count: 20, currency: 'EUR'
    })
  }
}
rows.push({ ...rows[0], user_id: 'bob', period_end: '2010-01-01' })
let queryCount = 0
const supabaseServiceServer = {
  from() {
    queryCount++
    let result = rows.slice()
    const orders = []
    const query = {
      select() { return this },
      eq(key, value) { result = result.filter(row => row[key] === value); return this },
      gte(key, value) { result = result.filter(row => row[key] >= value); return this },
      lt(key, value) { result = result.filter(row => row[key] < value); return this },
      order(key, { ascending }) { orders.push([key, ascending]); return this },
      async range(from, to) {
        result.sort((a, b) => {
          for (const [key, ascending] of orders) {
            const compared = String(a[key]).localeCompare(String(b[key]))
            if (compared) return ascending ? compared : -compared
          }
          return 0
        })
        return { data: result.slice(from, to + 1) }
      },
      limit(count) { return this.range(0, count - 1) }
    }
    return query
  }
}
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/app/api/collection/value-history/route.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText
const mod = { exports: {} }
new Function('require', 'module', 'exports', code)(name => {
  if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }
  if (name.endsWith('authUser')) return { getRequestUserId: async request => ({ userId: request.headers.get('authorization') === 'alice' ? 'alice' : null }) }
  return { supabaseServiceServer }
}, mod, mod.exports)
const request = (query, user = 'alice') => mod.exports.GET(new Request(`http://localhost/api/collection/value-history${query}`, { headers: { authorization: user } }))
async function main() {
  const latest = await request('?year=latest')
  assert.deepEqual(latest.body.window, { year: 2026, firstYear: 2020, lastYear: 2026 })
  assert.equal(latest.body.weeks.length, 52)
  assert.ok(latest.body.weeks.every(week => week.total && week.sets.length === 29))
  assert.equal(queryCount, 4) // Two bounds and two pages: no truncation at 1,200 rows.
  const older = await request('?year=2020')
  assert.equal(older.body.weeks.length, 52)
  assert.equal(older.body.weeks[0].periodEnd.slice(0, 4), '2020')
  assert.equal((await request('?year=2023')).body.weeks.length, 0)
  assert.equal((await request('')).body.weeks.length, 104) // Legacy mobile shape retained.
  assert.equal((await request('?year=wrong')).status, 400)
  assert.equal((await request('?year=latest', 'anonymous')).status, 401)
  console.log('PASS: complete year above 1,200 rows, old years, gaps, mobile compatibility, validation and user isolation.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
