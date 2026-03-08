import { NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

type HistoryRow = {
  period_start: string
  period_end: string
  set_code: string
  set_name: string
  is_total: boolean
  total_value: number
  priced_count: number
  expected_count: number
  us_fallback_count: number
  currency: string
  created_at: string
  updated_at: string
}

export async function GET(request: Request) {
  const userResult = await getRequestUserId(request)
  if (!userResult.userId) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const { data, error } = await supabaseServiceServer
    .from('collection_value_history')
    .select(
      'period_start, period_end, set_code, set_name, is_total, total_value, priced_count, expected_count, us_fallback_count, currency, created_at, updated_at'
    )
    .eq('user_id', userResult.userId)
    .order('period_start', { ascending: false })
    .order('is_total', { ascending: true })
    .limit(1200)

  if (error) {
    return NextResponse.json(
      { error: `Erreur lecture historique: ${error.message}` },
      { status: 500 }
    )
  }

  const rows = (data as HistoryRow[] | null) || []
  const byWeek = new Map<
    string,
    {
      periodStart: string
      periodEnd: string
      total: {
        value: number
        pricedCount: number
        expectedCount: number
        usFallbackCount: number
        currency: string
      } | null
      sets: Array<{
        setCode: string
        setName: string
        value: number
        pricedCount: number
        expectedCount: number
        usFallbackCount: number
      }>
    }
  >()

  for (const row of rows) {
    if (!byWeek.has(row.period_start)) {
      byWeek.set(row.period_start, {
        periodStart: row.period_start,
        periodEnd: row.period_end,
        total: null,
        sets: []
      })
    }

    const bucket = byWeek.get(row.period_start)!
    if (row.is_total || row.set_code === 'TOTAL') {
      bucket.total = {
        value: Number(row.total_value) || 0,
        pricedCount: Number(row.priced_count) || 0,
        expectedCount: Number(row.expected_count) || 0,
        usFallbackCount: Number(row.us_fallback_count) || 0,
        currency: row.currency || 'USD'
      }
      continue
    }

    bucket.sets.push({
      setCode: row.set_code,
      setName: row.set_name || row.set_code,
      value: Number(row.total_value) || 0,
      pricedCount: Number(row.priced_count) || 0,
      expectedCount: Number(row.expected_count) || 0,
      usFallbackCount: Number(row.us_fallback_count) || 0
    })
  }

  const weeks = [...byWeek.values()]
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .map((week) => ({
      ...week,
      sets: week.sets.sort((a, b) => b.value - a.value || a.setCode.localeCompare(b.setCode))
    }))

  return NextResponse.json({ weeks })
}
