const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/lib/scanner/cardCode.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', code)(mod, mod.exports)
const { extractCardCodes, normalizeCardCode, matchesCardCode } = mod.exports

assert.deepEqual(extractCardCodes('Luffy 5000 OP01-001 SR'), ['OP01-001'])
assert.deepEqual(extractCardCodes('0P OI — O0I\nOP01-001'), ['OP01-001'])
assert.deepEqual(extractCardCodes('ST 01 002 EB01-003 PRB01-004 P-005'), ['ST01-002', 'EB01-003', 'PRB01-004', 'P-005'])
assert.deepEqual(extractCardCodes('DON!! 1000 ©2025 OP01-0019 XOP01-001'), [])
assert.deepEqual(extractCardCodes('OP01-001 OP02-002'), ['OP01-001', 'OP02-002'])
assert.deepEqual(extractCardCodes('OP01-001L ST01-012SR EB01-003SEC'), ['OP01-001', 'ST01-012', 'EB01-003'])
assert.deepEqual(extractCardCodes('OP0|-00|'), ['OP01-001'])
assert.equal(normalizeCardCode(' op-01 001 '), 'OP01-001')
assert.equal(normalizeCardCode('OP01-001_p1'), null)
assert.equal(normalizeCardCode('OP01-0019'), null)
assert.equal(normalizeCardCode('OP'), null)
assert(matchesCardCode({ print_code: 'OP01-001_p1_ST01' }, 'OP01-001'))
assert(matchesCardCode({ print_code: 'SPECIAL', card: { base_code: 'OP01-001' } }, 'OP01-001'))
assert(!matchesCardCode({ print_code: 'OP01-0019' }, 'OP01-001'))
assert(!matchesCardCode({ print_code: 'OP01-010' }, 'OP01-001'))
console.log('PASS: OCR identifiers, common confusions, multiple candidates, exact matches and reprints.')
