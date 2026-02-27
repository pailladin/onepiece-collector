import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function getArg(name, fallback) {
  const prefix = `--${name}=`
  const arg = process.argv.find((entry) => entry.startsWith(prefix))
  if (!arg) return fallback
  return arg.slice(prefix.length)
}

async function main() {
  const root = process.cwd()
  loadEnvFile(path.join(root, '.env.local'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
    )
  }

  const email = getArg('email', 'test@test.fr')
  const password = getArg('password', 'test1234')
  const username = getArg('username', 'testeur')

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  let userId = created?.user?.id

  if (createError) {
    const msg = createError.message || ''
    if (!msg.toLowerCase().includes('already') && !msg.toLowerCase().includes('exists')) {
      throw createError
    }

    const { data: listData, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    })

    if (listError) throw listError
    const existing = listData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!existing) {
      throw new Error(`User ${email} exists but could not be retrieved via listUsers.`)
    }
    userId = existing.id
  }

  if (!userId) throw new Error('Unable to resolve user id')

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: userId,
      username
    },
    { onConflict: 'id' }
  )

  if (profileError) throw profileError

  console.log('User ready:')
  console.log(`- email: ${email}`)
  console.log(`- password: ${password}`)
  console.log(`- username: ${username}`)
  console.log(`- id: ${userId}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
