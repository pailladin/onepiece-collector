import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { getRequestUser } from '@/lib/server/authUser'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_BUCKET = process.env.BACKUP_BUCKET || 'cron'
const PAGE_SIZE = 1000
const TABLES = [
  'sets',
  'cards',
  'card_translations',
  'card_prints',
  'collections',
  'profiles',
  'friends',
  'cardmarket_accounts',
  'cardmarket_oauth_states',
  'cardmarket_print_links',
  'cardmarket_catalog_entries',
  'cardmarket_price_guide_entries',
  'collection_value_history'
] as const

async function fetchAllRows(table: string) {
  let from = 0
  const rows: Record<string, unknown>[] = []

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase.from(table).select('*').range(from, to)
    if (error) throw new Error(`[${table}] ${error.message}`)

    const batch = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

export async function POST(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const startedAt = new Date()
    const startedAtIso = startedAt.toISOString()
    const stamp = startedAtIso.replace(/[:.]/g, '-')

    const tableCounts: Record<string, number> = {}
    const tables: Record<string, Record<string, unknown>[]> = {}

    for (const table of TABLES) {
      const rows = await fetchAllRows(table)
      tables[table] = rows
      tableCounts[table] = rows.length
    }

    const payload = {
      ok: true,
      generatedAt: startedAtIso,
      generatedBy: userResult.user.email,
      tables: tableCounts,
      data: tables
    }

    const content = JSON.stringify(payload, null, 2)
    const bytes = Buffer.byteLength(content, 'utf8')
    const filePath = `backups/database/${stamp}.txt`

    const { error: uploadError } = await supabase.storage
      .from(DEFAULT_BUCKET)
      .upload(filePath, Buffer.from(content, 'utf8'), {
        contentType: 'text/plain; charset=utf-8',
        upsert: false
      })

    if (uploadError) {
      return NextResponse.json(
        { ok: false, error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      bucket: DEFAULT_BUCKET,
      filePath,
      bytes,
      tableCounts,
      generatedAt: startedAtIso
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
