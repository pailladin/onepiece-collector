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
  name: 'price-guide' | 'catalog' | 'collection-value-weekly'
  table: string
  lastSeenOn: string | null
  ageHours: number | null
  healthy: boolean
  error: string | null
  thresholdHours: number
}

async function fetchLatestValue(params: {
  tableName: string
  column: string
  filterColumn?: string
  filterValue?: string | boolean
}) {
  let query = supabase
    .from(params.tableName)
    .select(params.column)
    .order(params.column, { ascending: false })
    .limit(1)

  if (params.filterColumn) {
    query = query.eq(params.filterColumn, params.filterValue as never)
  }

  const filtered = await query.maybeSingle()
  if (filtered.error) {
    return { value: null as string | null, error: filtered.error.message }
  }

  const raw = filtered.data as Record<string, unknown> | null
  return {
    value: raw && typeof raw[params.column] === 'string' ? (raw[params.column] as string) : null,
    error: null as string | null
  }
}

function computeAgeHours(lastSeenOn: string | null, mode: 'date' | 'datetime'): number | null {
  if (!lastSeenOn) return null
  const input = mode === 'date' ? `${lastSeenOn}T00:00:00.000Z` : lastSeenOn
  const ms = Date.now() - Date.parse(input)
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
    {
      name: 'price-guide' as const,
      table: 'cardmarket_price_guide_entries',
      column: 'last_seen_on',
      mode: 'date' as const,
      thresholdHours: 48
    },
    {
      name: 'catalog' as const,
      table: 'cardmarket_catalog_entries',
      column: 'last_seen_on',
      mode: 'date' as const,
      thresholdHours: 48
    },
    {
      name: 'collection-value-weekly' as const,
      table: 'collection_value_history',
      column: 'updated_at',
      mode: 'datetime' as const,
      filterColumn: 'is_total',
      filterValue: true,
      thresholdHours: 24 * 8
    }
  ]

  const rows: CronStatusRow[] = []
  for (const check of checks) {
    const result = await fetchLatestValue({
      tableName: check.table,
      column: check.column,
      filterColumn: check.filterColumn,
      filterValue: check.filterValue
    })
    const ageHours = computeAgeHours(result.value, check.mode)
    const healthy =
      result.error == null && ageHours != null && ageHours <= check.thresholdHours
    rows.push({
      name: check.name,
      table: check.table,
      lastSeenOn: result.value,
      ageHours,
      healthy,
      error: result.error,
      thresholdHours: check.thresholdHours
    })
  }

  return NextResponse.json({ rows, generatedAt: new Date().toISOString() })
}
