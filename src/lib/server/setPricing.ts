import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export type PriceSource = 'cardmarket' | 'us'
export type CardmarketRange = { low: number | null; avg: number | null }
export type CardmarketTrendDirection = 'up' | 'down' | 'flat' | 'unknown'
export type CardmarketTrend = {
  direction: CardmarketTrendDirection
  score: number | null
  pct1d: number | null
  pct7d: number | null
  pct30d: number | null
}

export type SetPricingResult = {
  prices: Record<string, number>
  sources: Record<string, PriceSource>
  cardmarketProductIds: Record<string, string>
  cardmarketRanges: Record<string, CardmarketRange>
  cardmarketTrends: Record<string, CardmarketTrend>
  warnings: string[]
}

const IN_CHUNK_SIZE = 200

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function formatApiSetCode(code: string): string {
  const raw = (code || '').trim().toUpperCase().replace(/-/g, '')

  const ebMatch = raw.match(/^(OP\d{2})(EB\d{2})$/)
  if (ebMatch) return `${ebMatch[1]}-${ebMatch[2]}`

  if (raw.length <= 2) return raw
  return `${raw.slice(0, -2)}-${raw.slice(-2)}`
}

function normalizeSetCode(value: string): string {
  return (value || '').trim().toUpperCase().replace(/-/g, '')
}

function normalizePrintCode(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase()
}

function pickCardmarketPrice(range: { low: number | null; avg: number | null } | null | undefined) {
  if (!range) return null
  const low = Number(range.low)
  const avg = Number(range.avg)
  if (Number.isFinite(low)) return low
  if (Number.isFinite(avg)) return avg
  return null
}

function pctChange(current: number | null, previous: number | null): number | null {
  const cur = Number(current)
  const prev = Number(previous)
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || !prev || prev <= 0) return null
  return (cur - prev) / prev
}

function parseIsoDate(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`)
}

function pickHistoricalReference(
  rows: Array<{ snapshot_date: string; low: number | null; avg: number | null }>,
  latestDate: string,
  minDaysBack: number
) {
  const latestTs = parseIsoDate(latestDate)
  if (!Number.isFinite(latestTs)) return null
  for (const row of rows) {
    const ts = parseIsoDate(row.snapshot_date)
    if (!Number.isFinite(ts)) continue
    const days = (latestTs - ts) / (1000 * 60 * 60 * 24)
    if (days >= minDaysBack) return row
  }
  return null
}

function weightedAverage(parts: Array<{ value: number | null; weight: number }>): number | null {
  let sum = 0
  let weightSum = 0
  for (const part of parts) {
    if (!Number.isFinite(part.value)) continue
    sum += Number(part.value) * part.weight
    weightSum += part.weight
  }
  if (!weightSum) return null
  return sum / weightSum
}

export async function getSetPricing(setCode: string): Promise<SetPricingResult> {
  const normalizedSetCode = normalizeSetCode(setCode)
  const apiSetCode = formatApiSetCode(setCode)

  const prices: Record<string, number> = {}
  const sources: Record<string, PriceSource> = {}
  const cardmarketProductIds: Record<string, string> = {}
  const cardmarketRanges: Record<string, CardmarketRange> = {}
  const cardmarketTrends: Record<string, CardmarketTrend> = {}
  const warnings: string[] = []

  if (normalizedSetCode !== 'PROMO') {
    const response = await fetch(`https://www.optcgapi.com/api/sets/${apiSetCode}/`)
    if (response.ok) {
      const cards = await response.json()
      if (Array.isArray(cards)) {
        for (const card of cards) {
          const key = normalizePrintCode(card?.card_image_id)
          const price = Number(card?.inventory_price)
          if (!key || !Number.isFinite(price)) continue
          prices[key] = price
          sources[key] = 'us'
        }
      } else {
        warnings.push('Source US invalide: format inattendu')
      }
    } else {
      warnings.push(`Source US indisponible: HTTP ${response.status}`)
    }
  }

  const { data: setData } = await supabaseServiceServer
    .from('sets')
    .select('id')
    .eq('code', normalizedSetCode)
    .maybeSingle()

  if (!setData?.id) {
    return { prices, sources, cardmarketProductIds, cardmarketRanges, cardmarketTrends, warnings }
  }

  const { data: printsData } = await supabaseServiceServer
    .from('card_prints')
    .select('id, print_code')
    .eq('distribution_set_id', setData.id)

  const prints =
    ((printsData as Array<{ id: string; print_code: string | null }> | null) || []).filter((row) =>
      Boolean(normalizePrintCode(row.print_code))
    )

  if (prints.length === 0) {
    return { prices, sources, cardmarketProductIds, cardmarketRanges, cardmarketTrends, warnings }
  }

  const printCodeById = new Map<string, string>()
  for (const row of prints) {
    const normalizedPrintCode = normalizePrintCode(row.print_code)
    if (!normalizedPrintCode) continue
    printCodeById.set(row.id, normalizedPrintCode)
  }

  const printIds = [...printCodeById.keys()]
  const links: Array<{ card_print_id: string; cardmarket_product_id: string }> = []
  for (const idsChunk of chunkArray(printIds, IN_CHUNK_SIZE)) {
    const { data: linksData } = await supabaseServiceServer
      .from('cardmarket_print_links')
      .select('card_print_id, cardmarket_product_id')
      .in('card_print_id', idsChunk)

    links.push(
      ...(((linksData as Array<{ card_print_id: string; cardmarket_product_id: string }> | null) ||
        []) as Array<{ card_print_id: string; cardmarket_product_id: string }>)
    )
  }

  for (const link of links) {
    const printCode = printCodeById.get(link.card_print_id)
    if (!printCode || !link.cardmarket_product_id) continue
    cardmarketProductIds[printCode] = link.cardmarket_product_id
  }

  const productIds = [...new Set(links.map((row) => row.cardmarket_product_id).filter(Boolean))]
  if (productIds.length === 0) {
    return { prices, sources, cardmarketProductIds, cardmarketRanges, cardmarketTrends, warnings }
  }

  const catalogRows: Array<{
    entry_key: string
    product_id: string
    avg_price: number | null
    low_price: number | null
    avg: number | null
    low: number | null
    trend: number | null
    avg1: number | null
    avg7: number | null
    avg30: number | null
  }> = []

  for (const idsChunk of chunkArray(productIds, IN_CHUNK_SIZE)) {
    const { data: catalogPriceData } = await supabaseServiceServer
      .from('cardmarket_price_guide_entries')
      .select('entry_key, product_id, avg_price, low_price, avg, low, trend, avg1, avg7, avg30')
      .in('product_id', idsChunk)

    catalogRows.push(
      ...(((catalogPriceData as Array<{
        entry_key: string
        product_id: string
        avg_price: number | null
        low_price: number | null
        avg: number | null
        low: number | null
        trend: number | null
        avg1: number | null
        avg7: number | null
        avg30: number | null
      }> | null) || []) as Array<{
        entry_key: string
        product_id: string
        avg_price: number | null
        low_price: number | null
        avg: number | null
        low: number | null
        trend: number | null
        avg1: number | null
        avg7: number | null
        avg30: number | null
      }>)
    )
  }

  const byProductId = new Map<
    string,
    {
      range: CardmarketRange
      trend: number | null
      avg1: number | null
      avg7: number | null
      avg30: number | null
    }
  >()
  for (const row of catalogRows) {
    if (!row.product_id) continue
    const avgFromJson = Number(row.avg)
    const avgFromLegacy = Number(row.avg_price)
    const lowFromJson = Number(row.low)
    const lowFromLegacy = Number(row.low_price)

    const avg = Number.isFinite(avgFromJson)
      ? avgFromJson
      : Number.isFinite(avgFromLegacy)
        ? avgFromLegacy
        : null
    const low = Number.isFinite(lowFromJson)
      ? lowFromJson
      : Number.isFinite(lowFromLegacy)
        ? lowFromLegacy
        : null

    byProductId.set(row.product_id, {
      range: { low, avg },
      trend: Number.isFinite(Number(row.trend)) ? Number(row.trend) : null,
      avg1: Number.isFinite(Number(row.avg1)) ? Number(row.avg1) : null,
      avg7: Number.isFinite(Number(row.avg7)) ? Number(row.avg7) : null,
      avg30: Number.isFinite(Number(row.avg30)) ? Number(row.avg30) : null
    })
  }

  const snapshotRows: Array<{
    product_id: string
    snapshot_date: string
    low: number | null
    avg: number | null
  }> = []
  const snapshotLookback = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  for (const idsChunk of chunkArray(productIds, IN_CHUNK_SIZE)) {
    const { data: historyData } = await supabaseServiceServer
      .from('cardmarket_price_guide_snapshots')
      .select('product_id, snapshot_date, low, avg')
      .in('product_id', idsChunk)
      .gte('snapshot_date', snapshotLookback)
      .order('snapshot_date', { ascending: false })

    snapshotRows.push(
      ...(((historyData as Array<{
        product_id: string
        snapshot_date: string
        low: number | null
        avg: number | null
      }> | null) || []) as Array<{
        product_id: string
        snapshot_date: string
        low: number | null
        avg: number | null
      }>)
    )
  }

  const snapshotsByProductId = new Map<
    string,
    Array<{ snapshot_date: string; low: number | null; avg: number | null }>
  >()
  for (const row of snapshotRows) {
    if (!row.product_id || !row.snapshot_date) continue
    if (!snapshotsByProductId.has(row.product_id)) snapshotsByProductId.set(row.product_id, [])
    snapshotsByProductId.get(row.product_id)?.push(row)
  }

  for (const link of links) {
    const printCode = printCodeById.get(link.card_print_id)
    if (!printCode) continue
    const current = byProductId.get(link.cardmarket_product_id)
    const range = current?.range
    const low = range?.low ?? null
    const avg = range?.avg ?? null
    const calcPrice = low ?? avg

    // Linked print => source must be Cardmarket only.
    delete prices[printCode]
    delete sources[printCode]

    if (calcPrice != null && Number.isFinite(calcPrice)) {
      prices[printCode] = calcPrice
      sources[printCode] = 'cardmarket'
    }
    if (range) {
      cardmarketRanges[printCode] = range
    }

    const currentPrice = pickCardmarketPrice(range)
    const historyRows = snapshotsByProductId.get(link.cardmarket_product_id) || []
    const latestHistoryDate = historyRows[0]?.snapshot_date || null
    const prev1 = latestHistoryDate
      ? historyRows.find((row) => row.snapshot_date < latestHistoryDate) || null
      : null
    const prev7 = latestHistoryDate ? pickHistoricalReference(historyRows, latestHistoryDate, 7) : null
    const prev30 = latestHistoryDate ? pickHistoricalReference(historyRows, latestHistoryDate, 30) : null

    const pct1d = pctChange(currentPrice, pickCardmarketPrice(prev1))
    const pct7d = pctChange(currentPrice, pickCardmarketPrice(prev7))
    const pct30d = pctChange(currentPrice, pickCardmarketPrice(prev30))

    const nativeScore = weightedAverage([
      { value: pctChange(current?.avg1 ?? null, current?.avg7 ?? null), weight: 0.35 },
      { value: pctChange(current?.avg7 ?? null, current?.avg30 ?? null), weight: 0.4 },
      { value: pctChange(current?.trend ?? null, current?.avg30 ?? null), weight: 0.25 }
    ])
    const snapshotScore = weightedAverage([
      { value: pct1d, weight: 0.5 },
      { value: pct7d, weight: 0.3 },
      { value: pct30d, weight: 0.2 }
    ])
    const score = weightedAverage([
      { value: snapshotScore, weight: 0.65 },
      { value: nativeScore, weight: 0.35 }
    ])

    let direction: CardmarketTrendDirection = 'unknown'
    if (Number.isFinite(score)) {
      if ((score as number) >= 0.015) direction = 'up'
      else if ((score as number) <= -0.015) direction = 'down'
      else direction = 'flat'
    }

    cardmarketTrends[printCode] = {
      direction,
      score,
      pct1d,
      pct7d,
      pct30d
    }
  }

  return { prices, sources, cardmarketProductIds, cardmarketRanges, cardmarketTrends, warnings }
}
