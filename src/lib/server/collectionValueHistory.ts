import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { getSetPricing } from '@/lib/server/setPricing'

type CollectionOwnedRow = {
  card_print_id: string
  quantity: number
}

type CardPrintLookupRow = {
  id: string
  distribution_set_id: string
  print_code: string | null
}

type SetLookupRow = {
  id: string
  code: string
  name: string | null
}

type SetPricingSnapshot = {
  setCode: string
  setName: string
  totalValue: number
  pricedCount: number
  expectedCount: number
  usFallbackCount: number
}

export type UserCollectionSnapshot = {
  periodStart: string
  periodEnd: string
  currency: 'USD'
  totalValue: number
  pricedCount: number
  expectedCount: number
  usFallbackCount: number
  setRows: SetPricingSnapshot[]
}

const IN_CHUNK_SIZE = 400

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function normalizePrintCode(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase()
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getUtcWeekBounds(now: Date = new Date()) {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = base.getUTCDay() // 0=Sun, 1=Mon, ...
  const daysSinceMonday = (day + 6) % 7
  const start = new Date(base.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  return {
    periodStart: toIsoDate(start),
    periodEnd: toIsoDate(end)
  }
}

export async function computeUserCollectionSnapshot(userId: string): Promise<UserCollectionSnapshot> {
  const { periodStart, periodEnd } = getUtcWeekBounds()

  const { data: ownedData, error: ownedError } = await supabaseServiceServer
    .from('collections')
    .select('card_print_id, quantity')
    .eq('user_id', userId)
    .gt('quantity', 0)

  if (ownedError) {
    throw new Error(`Erreur collection: ${ownedError.message}`)
  }

  const ownedRows = (ownedData as CollectionOwnedRow[] | null) || []
  if (ownedRows.length === 0) {
    return {
      periodStart,
      periodEnd,
      currency: 'USD',
      totalValue: 0,
      pricedCount: 0,
      expectedCount: 0,
      usFallbackCount: 0,
      setRows: []
    }
  }

  const printIds = [...new Set(ownedRows.map((row) => row.card_print_id))]
  const printRows: CardPrintLookupRow[] = []
  for (const chunk of chunkArray(printIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabaseServiceServer
      .from('card_prints')
      .select('id, distribution_set_id, print_code')
      .in('id', chunk)

    if (error) {
      throw new Error(`Erreur prints: ${error.message}`)
    }
    printRows.push(...((data as CardPrintLookupRow[] | null) || []))
  }

  if (printRows.length === 0) {
    return {
      periodStart,
      periodEnd,
      currency: 'USD',
      totalValue: 0,
      pricedCount: 0,
      expectedCount: 0,
      usFallbackCount: 0,
      setRows: []
    }
  }

  const setIds = [...new Set(printRows.map((row) => row.distribution_set_id))]
  const setRows: SetLookupRow[] = []
  for (const chunk of chunkArray(setIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabaseServiceServer
      .from('sets')
      .select('id, code, name')
      .in('id', chunk)

    if (error) {
      throw new Error(`Erreur sets: ${error.message}`)
    }
    setRows.push(...((data as SetLookupRow[] | null) || []))
  }

  const setById = new Map(setRows.map((row) => [row.id, row]))
  const printById = new Map(printRows.map((row) => [row.id, row]))
  const groupedBySet = new Map<
    string,
    { setCode: string; setName: string; rows: Array<{ printCode: string; quantity: number }> }
  >()

  for (const owned of ownedRows) {
    const print = printById.get(owned.card_print_id)
    if (!print) continue
    const set = setById.get(print.distribution_set_id)
    if (!set) continue
    const printCode = normalizePrintCode(print.print_code)
    if (!printCode) continue

    if (!groupedBySet.has(set.id)) {
      groupedBySet.set(set.id, {
        setCode: set.code,
        setName: set.name || set.code,
        rows: []
      })
    }
    groupedBySet.get(set.id)?.rows.push({
      printCode,
      quantity: owned.quantity || 0
    })
  }

  let totalValue = 0
  let pricedCount = 0
  let expectedCount = 0
  let usFallbackCount = 0
  const outputSetRows: SetPricingSnapshot[] = []

  for (const group of groupedBySet.values()) {
    const pricing = await getSetPricing(group.setCode)
    let setTotal = 0
    let setPriced = 0
    let setExpected = 0
    let setUsFallback = 0

    for (const row of group.rows) {
      setExpected += 1
      const unitPrice = pricing.prices[row.printCode]
      if (!Number.isFinite(unitPrice)) continue
      setPriced += 1
      setTotal += unitPrice * row.quantity
      if (pricing.sources[row.printCode] !== 'cardmarket') {
        setUsFallback += 1
      }
    }

    expectedCount += setExpected
    pricedCount += setPriced
    usFallbackCount += setUsFallback
    totalValue += setTotal

    outputSetRows.push({
      setCode: group.setCode,
      setName: group.setName,
      totalValue: setTotal,
      pricedCount: setPriced,
      expectedCount: setExpected,
      usFallbackCount: setUsFallback
    })
  }

  outputSetRows.sort((a, b) => b.totalValue - a.totalValue || a.setCode.localeCompare(b.setCode))

  return {
    periodStart,
    periodEnd,
    currency: 'USD',
    totalValue,
    pricedCount,
    expectedCount,
    usFallbackCount,
    setRows: outputSetRows
  }
}

export async function saveUserCollectionSnapshot(params: {
  userId: string
  source: string
  snapshot: UserCollectionSnapshot
}) {
  const rows = [
    ...params.snapshot.setRows.map((row) => ({
      user_id: params.userId,
      period_start: params.snapshot.periodStart,
      period_end: params.snapshot.periodEnd,
      set_code: row.setCode,
      set_name: row.setName,
      is_total: false,
      total_value: row.totalValue,
      priced_count: row.pricedCount,
      expected_count: row.expectedCount,
      us_fallback_count: row.usFallbackCount,
      currency: params.snapshot.currency,
      source: params.source
    })),
    {
      user_id: params.userId,
      period_start: params.snapshot.periodStart,
      period_end: params.snapshot.periodEnd,
      set_code: 'TOTAL',
      set_name: 'Total Collection',
      is_total: true,
      total_value: params.snapshot.totalValue,
      priced_count: params.snapshot.pricedCount,
      expected_count: params.snapshot.expectedCount,
      us_fallback_count: params.snapshot.usFallbackCount,
      currency: params.snapshot.currency,
      source: params.source
    }
  ]

  const { error } = await supabaseServiceServer
    .from('collection_value_history')
    .upsert(rows, { onConflict: 'user_id,period_start,set_code' })

  if (error) {
    throw new Error(`Erreur sauvegarde snapshot: ${error.message}`)
  }
}
