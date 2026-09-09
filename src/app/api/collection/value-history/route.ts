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

  const requestedYear = new URL(request.url).searchParams.get('year')
  if (requestedYear !== null && requestedYear !== 'latest' && !/^[1-9]\d{3}$/.test(requestedYear)) {
    return NextResponse.json({ error: 'Année invalide' }, { status: 400 })
  }
  let historyWindow: { year: number; firstYear: number; lastYear: number } | null = null
  if (requestedYear !== null) {
    const bounds = await Promise.all([true, false].map((ascending) =>
      supabaseServiceServer.from('collection_value_history').select('period_end')
        .eq('user_id', userResult.userId).order('period_end', { ascending }).limit(1)
    ))
    if (bounds.some((result) => result.error)) {
      return NextResponse.json({ error: 'Erreur lecture des périodes' }, { status: 500 })
    }
    const lastYear = Number(bounds[1].data?.[0]?.period_end.slice(0, 4)) || new Date().getUTCFullYear()
    const firstYear = Number(bounds[0].data?.[0]?.period_end.slice(0, 4)) || lastYear
    historyWindow = { year: requestedYear === 'latest' ? lastYear : Number(requestedYear), firstYear, lastYear }
  }

  const query = () => supabaseServiceServer
    .from('collection_value_history')
    .select(
      'period_start, period_end, set_code, set_name, is_total, total_value, priced_count, expected_count, us_fallback_count, currency, created_at, updated_at'
    )
    .eq('user_id', userResult.userId)
    .order('period_start', { ascending: true })
    .order('set_code', { ascending: true })

  const rows: HistoryRow[] = []
  // Keep the legacy mobile response while allowing the web to request complete years.
  for (let from = 0; ; from += 1000) {
    let pageQuery = query()
    if (historyWindow) {
      pageQuery = pageQuery.gte('period_end', `${historyWindow.year}-01-01`)
        .lt('period_end', `${historyWindow.year + 1}-01-01`)
    }
    const { data, error } = await pageQuery.range(from, from + 999)
    if (error) {
      return NextResponse.json({ error: `Erreur lecture historique: ${error.message}` }, { status: 500 })
    }
    const page = (data as HistoryRow[] | null) || []
    rows.push(...page)
    if (page.length < 1000) break
  }
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
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((week) => ({
      ...week,
      sets: week.sets.sort((a, b) => b.value - a.value || a.setCode.localeCompare(b.setCode))
    }))

  return NextResponse.json({ weeks, window: historyWindow }, {
    headers: { 'Cache-Control': 'private, no-store' }
  })
}
