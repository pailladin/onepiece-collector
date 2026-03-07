import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { getRequestUser } from '@/lib/server/authUser'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type CronStatusRow = {
  name: 'price-guide' | 'catalog'
  table: string
  lastSeenOn: string | null
  ageHours: number | null
  healthy: boolean
  error: string | null
}

async function fetchLastSeenOn(tableName: string) {
  const { data, error } = await supabase
    .from(tableName)
    .select('last_seen_on')
    .order('last_seen_on', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { lastSeenOn: null as string | null, error: error.message }
  }

  return {
    lastSeenOn:
      data && typeof (data as { last_seen_on?: unknown }).last_seen_on === 'string'
        ? ((data as { last_seen_on: string }).last_seen_on || null)
        : null,
    error: null as string | null
  }
}

function computeAgeHours(lastSeenOn: string | null): number | null {
  if (!lastSeenOn) return null
  const ms = Date.now() - Date.parse(`${lastSeenOn}T00:00:00.000Z`)
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.round((ms / (1000 * 60 * 60)) * 10) / 10)
}

export async function GET(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const checks = [
    { name: 'price-guide' as const, table: 'cardmarket_price_guide_entries' },
    { name: 'catalog' as const, table: 'cardmarket_catalog_entries' }
  ]

  const rows: CronStatusRow[] = []
  for (const check of checks) {
    const result = await fetchLastSeenOn(check.table)
    const ageHours = computeAgeHours(result.lastSeenOn)
    const healthy = result.error == null && ageHours != null && ageHours <= 48
    rows.push({
      name: check.name,
      table: check.table,
      lastSeenOn: result.lastSeenOn,
      ageHours,
      healthy,
      error: result.error
    })
  }

  return NextResponse.json({ rows, generatedAt: new Date().toISOString() })
}
