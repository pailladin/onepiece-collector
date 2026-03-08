import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export type PriceSource = 'cardmarket' | 'us'
export type CardmarketRange = { low: number | null; avg: number | null }

export type SetPricingResult = {
  prices: Record<string, number>
  sources: Record<string, PriceSource>
  cardmarketProductIds: Record<string, string>
  cardmarketRanges: Record<string, CardmarketRange>
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

export async function getSetPricing(setCode: string): Promise<SetPricingResult> {
  const normalizedSetCode = normalizeSetCode(setCode)
  const apiSetCode = formatApiSetCode(setCode)

  const prices: Record<string, number> = {}
  const sources: Record<string, PriceSource> = {}
  const cardmarketProductIds: Record<string, string> = {}
  const cardmarketRanges: Record<string, CardmarketRange> = {}
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
    return { prices, sources, cardmarketProductIds, cardmarketRanges, warnings }
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
    return { prices, sources, cardmarketProductIds, cardmarketRanges, warnings }
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
    return { prices, sources, cardmarketProductIds, cardmarketRanges, warnings }
  }

  const catalogRows: Array<{
    product_id: string
    avg_price: number | null
    low_price: number | null
    avg: number | null
    low: number | null
  }> = []

  for (const idsChunk of chunkArray(productIds, IN_CHUNK_SIZE)) {
    const { data: catalogPriceData } = await supabaseServiceServer
      .from('cardmarket_price_guide_entries')
      .select('product_id, avg_price, low_price, avg, low')
      .in('product_id', idsChunk)

    catalogRows.push(
      ...(((catalogPriceData as Array<{
        product_id: string
        avg_price: number | null
        low_price: number | null
        avg: number | null
        low: number | null
      }> | null) || []) as Array<{
        product_id: string
        avg_price: number | null
        low_price: number | null
        avg: number | null
        low: number | null
      }>)
    )
  }

  const byProductId = new Map<string, CardmarketRange>()
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

    byProductId.set(row.product_id, { low, avg })
  }

  for (const link of links) {
    const printCode = printCodeById.get(link.card_print_id)
    if (!printCode) continue
    const range = byProductId.get(link.cardmarket_product_id)
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
  }

  return { prices, sources, cardmarketProductIds, cardmarketRanges, warnings }
}
