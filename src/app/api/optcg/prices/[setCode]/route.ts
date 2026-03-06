import { NextResponse } from 'next/server'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

function formatApiSetCode(code: string): string {
  const raw = (code || '').trim().toUpperCase().replace(/-/g, '')

  const ebMatch = raw.match(/^(OP\d{2})(EB\d{2})$/)
  if (ebMatch) return `${ebMatch[1]}-${ebMatch[2]}`

  if (raw.length <= 2) return raw
  return `${raw.slice(0, -2)}-${raw.slice(-2)}`
}

function normalizePrintCode(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase()
}

function normalizeSetCode(value: string): string {
  return (value || '').trim().toUpperCase().replace(/-/g, '')
}

type PriceSource = 'cardmarket' | 'us'
type CardmarketRange = { low: number | null; avg: number | null }

export async function GET(
  _request: Request,
  context: { params: Promise<{ setCode: string }> }
) {
  try {
    const { setCode } = await context.params
    const normalizedSetCode = normalizeSetCode(setCode)
    const apiSetCode = formatApiSetCode(setCode)

    const response = await fetch(`https://www.optcgapi.com/api/sets/${apiSetCode}/`)

    if (!response.ok) {
      return NextResponse.json(
        { error: `Erreur API ${response.status}` },
        { status: response.status }
      )
    }

    const cards = await response.json()
    if (!Array.isArray(cards)) {
      return NextResponse.json({ prices: {} })
    }

    const prices: Record<string, number> = {}
    const sources: Record<string, PriceSource> = {}
    const cardmarketProductIds: Record<string, string> = {}
    const cardmarketRanges: Record<string, CardmarketRange> = {}

    for (const card of cards) {
      const key = normalizePrintCode(card?.card_image_id)
      const price = Number(card?.inventory_price)
      if (!key || !Number.isFinite(price)) continue
      prices[key] = price
      sources[key] = 'us'
    }

    const { data: setData } = await supabaseServiceServer
      .from('sets')
      .select('id')
      .eq('code', normalizedSetCode)
      .maybeSingle()

    if (setData?.id) {
      const { data: printsData } = await supabaseServiceServer
        .from('card_prints')
        .select('id, print_code')
        .eq('distribution_set_id', setData.id)

      const prints =
        ((printsData as Array<{ id: string; print_code: string | null }> | null) || []).filter(
          (row) => Boolean(normalizePrintCode(row.print_code))
        )

      if (prints.length > 0) {
        const printCodeById = new Map<string, string>()
        for (const row of prints) {
          const normalizedPrintCode = normalizePrintCode(row.print_code)
          if (!normalizedPrintCode) continue
          printCodeById.set(row.id, normalizedPrintCode)
        }

        const printIds = [...printCodeById.keys()]
        const { data: linksData } = await supabaseServiceServer
          .from('cardmarket_print_links')
          .select('card_print_id, cardmarket_product_id')
          .in('card_print_id', printIds)

        const links =
          (linksData as Array<{ card_print_id: string; cardmarket_product_id: string }> | null) ||
          []

        const productIds = [...new Set(links.map((row) => row.cardmarket_product_id).filter(Boolean))]
        if (productIds.length > 0) {
          const { data: catalogPriceData } = await supabaseServiceServer
            .from('cardmarket_price_guide_entries')
            .select('product_id, avg_price, low_price, avg, low')
            .in('product_id', productIds)

          const byProductId = new Map<string, CardmarketRange>()
          for (const row of
            ((catalogPriceData as Array<{
              product_id: string
              avg_price: number | null
              low_price: number | null
              avg: number | null
              low: number | null
            }> | null) ||
              [])) {
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

            if (calcPrice != null && Number.isFinite(calcPrice)) {
              prices[printCode] = calcPrice
              sources[printCode] = 'cardmarket'
            }
            if (link.cardmarket_product_id) {
              cardmarketProductIds[printCode] = link.cardmarket_product_id
            }
            if (range) {
              cardmarketRanges[printCode] = range
            }
          }
        }
      }
    }

    return NextResponse.json({ prices, sources, cardmarketProductIds, cardmarketRanges })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
